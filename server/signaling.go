package server

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type SignalMessage struct {
	Type      string      `json:"type"`
	Offer     interface{} `json:"offer,omitempty"`
	Answer    interface{} `json:"answer,omitempty"`
	Candidate interface{} `json:"candidate,omitempty"`
}

func HandleWebsocket(roomMap *RoomMap, writer http.ResponseWriter, reader *http.Request) {
	roomID := reader.URL.Query().Get("room")

	if roomID == "" {
		http.Error(writer, "room Id is required", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(writer, reader, nil)
	if err != nil {
		log.Println("Websocket Upgrade Failed", err)
		return
	}

	particiant := Participant{
		Conn: conn,
	}

	roomMap.Lock()
	roomMap.Rooms[roomID] = append(roomMap.Rooms[roomID], particiant)
	roomMap.Unlock()

	defer func() {
		conn.Close()
		roomMap.Lock()

		particiants := roomMap.Rooms[roomID]

		for i, p := range particiants {
			if p.Conn == conn {
				particiants = append(particiants[:i], particiants[i+1:]...)
				break
			}
		}
		if len(particiants) == 0 {
			delete(roomMap.Rooms, roomID)
		} else {
			roomMap.Rooms[roomID] = particiants
		}
		roomMap.Unlock()
	}()

	for {
		var message SignalMessage

		err := conn.ReadJSON(&message)
		if err != nil {
			log.Println("WebSocket read error:", err)
			break
		}

		broadcastToRoom(
			roomMap,
			roomID,
			conn,
			message,
		)
	}
}

func broadcastToRoom(
	roomMap *RoomMap,
	roomID string,
	sender *websocket.Conn,
	message SignalMessage,
) {
	roomMap.Lock()
	defer roomMap.Unlock()

	particiants := roomMap.Rooms[roomID]

	for _, particiant := range particiants {
		if particiant.Conn == sender {
			continue
		}

		err := particiant.Conn.WriteJSON(message)
		if err != nil {
			log.Println("There was an error in broadcasting message", err)
		}
	}
}
