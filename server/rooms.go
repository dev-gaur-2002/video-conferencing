package server

import (
	"sync"

	"github.com/gorilla/websocket"
)

type Participant struct {
	Host bool
	Conn *websocket.Conn
}

type RoomMap struct {
	sync.RWMutex
	Rooms map[string][]Participant
}

func NewRoom() *RoomMap {
	return &RoomMap{
		Rooms: make(map[string][]Participant),
	}
}
