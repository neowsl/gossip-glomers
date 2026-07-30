(ns export-maelstrom
  (:require [cheshire.core :as json]
            [clojure.data.fressian :as fress]
            [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [maelstrom.net.journal :as journal]))

(def ignored-message-types
  #{"init" "init_ok" "topology" "topology_ok"})

(defn read-journal-file [file]
  (with-open [reader (-> file
                         io/input-stream
                         (fress/create-reader :handlers journal/read-handlers))]
    (doall (journal/reader-seq reader))))

(defn read-journal [run-dir]
  (->> (file-seq (io/file run-dir journal/journal-dir-name))
       (filter #(str/ends-with? (.getName %) ".fressian"))
       (mapcat read-journal-file)
       (sort-by :id)))

(defn read-history [run-dir]
  (let [file (io/file run-dir "history.edn")]
    (if (.exists file)
      (with-open [reader (io/reader file)]
        (->> (line-seq reader)
             (remove str/blank?)
             (mapv edn/read-string)))
      [])))

(defn client? [node-id]
  (boolean (re-matches #"c\d+" node-id)))

(defn worker? [node-id]
  (boolean (re-matches #"n\d+" node-id)))

(defn node-number [node-id]
  (second (re-matches #"[a-z-]+(\d+)" node-id)))

(defn visual-endpoints [src dest]
  (cond
    (client? src) [(str "c" (node-number dest)) dest]
    (client? dest) [src (str "c" (node-number src))]
    :else [src dest]))

(defn find-workers [events]
  (or (some (fn [event]
              (let [body (-> event :message :body)]
                (when (= "init" (:type body))
                  (vec (:node_ids body)))))
            events)
      (->> events
           (mapcat (fn [event]
                     [(-> event :message :src)
                      (-> event :message :dest)]))
           (filter worker?)
           distinct
           sort
           vec)))

(defn find-topology [events]
  (some (fn [event]
          (let [body (-> event :message :body)]
            (when (= "topology" (:type body))
              (:topology body))))
        events))

(defn find-services [events]
  (->> events
       (mapcat (fn [event]
                 [(-> event :message :src)
                  (-> event :message :dest)]))
       (remove #(or (client? %) (worker? %)))
       distinct
       sort
       vec))

(defn pair-messages [events]
  (:messages
   (reduce
    (fn [{:keys [messages indices] :as state} event]
      (let [message (:message event)
            message-id (:id message)]
        (case (:type event)
          :send
          (let [body (:body message)]
            (if (ignored-message-types (:type body))
              state
              (let [[src dest] (visual-endpoints (:src message) (:dest message))]
                {:messages (conj messages
                                 {:kind "message"
                                  :messageId message-id
                                  :sentAt (:time event)
                                  :receivedAt nil
                                  :delivered false
                                  :src src
                                  :dest dest
                                  :originalSrc (:src message)
                                  :originalDest (:dest message)
                                  :type (:type body)
                                  :body body})
                 :indices (assoc indices message-id (count messages))})))

          :recv
          (if-let [index (get indices message-id)]
            (-> state
                (assoc-in [:messages index :receivedAt] (:time event))
                (assoc-in [:messages index :delivered] true))
            state))))
    {:messages [] :indices {}}
    events)))

(defn connected-components [workers blocked]
  (loop [remaining (set workers)
         groups []]
    (if-let [start (first remaining)]
      (let [group (loop [queue [start]
                         seen #{start}]
                    (if-let [node (first queue)]
                      (let [neighbors (->> workers
                                           (remove seen)
                                           (remove #(contains? (get blocked node #{}) %))
                                           (remove #(contains? (get blocked % #{}) node)))]
                        (recur (into (subvec queue 1) neighbors)
                               (into seen neighbors)))
                      seen))]
        (recur (reduce disj remaining group)
               (conj groups (vec (sort group)))))
      groups)))

(defn partition-groups [workers value]
  (let [blocked (when (sequential? value)
                  (some #(when (map? %) %) value))]
    (if blocked
      (connected-components workers blocked)
      [])))

(defn first-workload-history-time [history]
  (some (fn [op]
          (when (and (= :invoke (:type op))
                     (not= :nemesis (:process op)))
            (:time op)))
        history))

(defn first-workload-network-time [messages]
  (:sentAt (first (filter #(client? (:originalSrc %)) messages))))

(defn control-events [history workers clock-offset]
  (->> history
       (keep (fn [op]
               (let [function (:f op)
                     event-time (+ clock-offset (:time op))]
                 (cond
                   (and (= :nemesis (:process op))
                        (= :info (:type op))
                        (= :start-partition function)
                        (seq (partition-groups workers (:value op))))
                   {:kind "control"
                    :time event-time
                    :type "nemesis"
                    :action "start-partition"
                    :partitionGroups (partition-groups workers (:value op))}

                   (and (= :nemesis (:process op))
                        (= :info (:type op))
                        (= :stop-partition function))
                   {:kind "control"
                    :time event-time
                    :type "nemesis"
                    :action "stop-partition"
                    :partitionGroups []}

                   (and (= :info (:type op))
                        (= :crash function)
                        (integer? (:process op)))
                   {:kind "control"
                    :time event-time
                    :type "crash"
                    :action "crash"
                    :node (nth workers (mod (:process op) (count workers)))}

                   :else nil))))
       (reduce (fn [events event]
                 (if (= (select-keys event [:type :action :node :partitionGroups])
                        (select-keys (peek events) [:type :action :node :partitionGroups]))
                   events
                   (conj events event)))
               [])))

(defn normalize-time [origin nanos]
  (/ (- nanos origin) 1000000.0))

(defn normalize-event [origin event]
  (cond-> event
    (:sentAt event) (update :sentAt #(normalize-time origin %))
    (:receivedAt event) (update :receivedAt #(normalize-time origin %))
    (:time event) (update :time #(normalize-time origin %))))

(defn export-run [run-dir output-file challenge]
  (let [journal-events (read-journal run-dir)
        history (read-history run-dir)
        workers (find-workers journal-events)
        messages (pair-messages journal-events)
        history-time (first-workload-history-time history)
        network-time (first-workload-network-time messages)
        clock-offset (if (and history-time network-time)
                       (- network-time history-time)
                       0)
        controls (control-events history workers clock-offset)
        all-events (sort-by #(or (:sentAt %) (:time %))
                            (concat messages controls))
        origin (or (some-> all-events first (#(or (:sentAt %) (:time %)))) 0)
        normalized-events (mapv #(normalize-event origin %) all-events)
        duration (reduce max 0
                         (map #(or (:receivedAt %) (:sentAt %) (:time %) 0)
                              normalized-events))
        output {:version 1
                :challenge challenge
                :duration duration
                :topology {:workers workers
                           :services (find-services journal-events)
                           :links (find-topology journal-events)}
                :events normalized-events}]
    (io/make-parents output-file)
    (spit output-file (json/generate-string output))
    (println (format "Exported %,d messages and %,d controls to %s"
                     (count messages)
                     (count controls)
                     output-file))))

(let [[run-dir output-file challenge] *command-line-args*]
  (when-not (and run-dir output-file challenge)
    (binding [*out* *err*]
      (println "Usage: export-maelstrom.clj RUN_DIR OUTPUT_FILE CHALLENGE"))
    (System/exit 1))
  (export-run run-dir output-file challenge))
