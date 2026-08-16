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
	Type      string
	Offer     interface{}
	Answer    interface{}
	Candidate interface{}
}

func HandleWebsocket(roomMap *RoomMap, writer http.ResponseWriter, reader *http.Request) {
	roomId := reader.URL.Query().Get("room")

	if roomId == "" {
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
	roomMap.Rooms[roomId] = append(roomMap.Rooms[roomId], particiant)
	roomMap.Unlock()

	defer func() {
		conn.Close()
		roomMap.Lock()

		particiants := roomMap.Rooms[roomId]

		for i, p := range particiants {
			if p.Conn == conn {
				particiants = append(particiants[:i], particiants[i+1:]...)
				break
			}
		}
		if len(particiants) == 0 {
			delete(roomMap.Rooms, roomId)
		} else {
			roomMap.Rooms[roomId] = particiants
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
			roomId,
			conn,
			message,
		)
	}
}

func broadcastToRoom(
	roomMap *RoomMap,
	roomId string,
	sender *websocket.Conn,
	message SignalMessage,
) {
	roomMap.Lock()
	defer roomMap.Unlock()

	particiants := roomMap.Rooms[roomId]

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
