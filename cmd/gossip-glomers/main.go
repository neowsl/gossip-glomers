package main

import (
	"flag"
	"gossip-glomers/internal/server"
	"log"
)

func main() {
	challengeID := flag.String("challenge", "", "The ID of the current challenge to run (e.g. 3a)")

	flag.Parse()

	s := server.New(challengeID)

	if err := s.Run(); err != nil {
		log.Fatal(err)
	}
}
