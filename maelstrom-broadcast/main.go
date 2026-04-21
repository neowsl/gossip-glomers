package main

import (
	"log"
)

func main() {
	s := NewServer()

	if err := s.Run(); err != nil {
		log.Fatal(err)
	}
}
