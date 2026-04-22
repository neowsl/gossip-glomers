package main

import (
	"gossip-glomers/internal/server"
	"log"
)

func main() {
	s := server.NewServer()

	if err := s.Run(); err != nil {
		log.Fatal(err)
	}
}
