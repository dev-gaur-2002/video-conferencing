package main

import (
	"log"
	"net/http"

	"video-conferencing/server"
)

func main() {
	rooms := server.NewRoom()

	http.HandleFunc("/ws",
		func(w http.ResponseWriter, re *http.Request) {
			server.HandleWebsocket(rooms, w, re)
		},
	)

	log.Println("Server is up on port: 8000")
	log.Fatal(http.ListenAndServe(":8000", nil))
}
