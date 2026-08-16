import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import type { SignalMessage } from "../types";

const WS_URL = "ws://localhost:8000";

function Room() {
  const { roomId } = useParams<{ roomId: string }>();

  const localVideoRef =
    useRef<HTMLVideoElement>(null);

  const remoteVideoRef =
    useRef<HTMLVideoElement>(null);

  const socketRef =
    useRef<WebSocket | null>(null);

  const peerConnectionRef =
    useRef<RTCPeerConnection | null>(null);

  const localStreamRef =
    useRef<MediaStream | null>(null);

  const pendingCandidates =
    useRef<RTCIceCandidateInit[]>([]);

  const [connected, setConnected] =
    useState(false);

  useEffect(() => {
    if (!roomId) return;

    start();

    return () => {
      cleanup();
    };
  }, [roomId]);

  const start = async () => {
    try {
      /*
       * 1. Get camera + microphone
       */
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject =
          stream;
      }

      /*
       * 2. Create WebSocket
       */
      const socket = new WebSocket(
        `${WS_URL}/ws?room=${roomId}`
      );

      socketRef.current = socket;

      /*
       * 3. Create WebRTC connection
       */
      const peerConnection =
        new RTCPeerConnection({
          iceServers: [
            {
              urls: "stun:stun.l.google.com:19302",
            },
          ],
        });

      peerConnectionRef.current =
        peerConnection;

      /*
       * 4. Add local camera/mic tracks
       */
      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(
          track,
          stream
        );
      });

      /*
       * 5. Receive remote stream
       */
      peerConnection.ontrack = (event) => {
        console.log(
          "Received remote stream"
        );

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject =
            event.streams[0];
        }
      };

      /*
       * 6. Send ICE candidates
       */
      peerConnection.onicecandidate = (
        event
      ) => {
        if (
          event.candidate &&
          socket.readyState === WebSocket.OPEN
        ) {
          const message: SignalMessage = {
            type: "candidate",
            candidate:
              event.candidate.toJSON(),
          };

          socket.send(
            JSON.stringify(message)
          );
        }
      };

      /*
       * 7. WebSocket connected
       */
      socket.onopen = () => {
        console.log(
          "Connected to signaling server"
        );

        setConnected(true);
      };

      /*
       * 8. Receive signaling messages
       */
      socket.onmessage = async (event) => {
        try {
          const message: SignalMessage =
            JSON.parse(event.data);

          console.log(
            "Received:",
            message.type
          );

          switch (message.type) {
            case "offer":
              if (message.offer) {
                await handleOffer(
                  message.offer
                );
              }
              break;

            case "answer":
              if (message.answer) {
                await handleAnswer(
                  message.answer
                );
              }
              break;

            case "candidate":
              if (message.candidate) {
                await handleCandidate(
                  message.candidate
                );
              }
              break;
          }
        } catch (error) {
          console.error(
            "Failed to process message:",
            error
          );
        }
      };

      socket.onerror = (error) => {
        console.error(
          "WebSocket error:",
          error
        );
      };

      socket.onclose = () => {
        console.log(
          "WebSocket disconnected"
        );

        setConnected(false);
      };
    } catch (error) {
      console.error(
        "Failed to start WebRTC:",
        error
      );
    }
  };

  /*
   * Handle incoming OFFER
   */
  const handleOffer = async (
    offer: RTCSessionDescriptionInit
  ) => {
    const peerConnection =
      peerConnectionRef.current;

    const socket =
      socketRef.current;

    if (!peerConnection || !socket) {
      return;
    }

    console.log("Received offer");

    /*
     * Tell WebRTC about remote SDP
     */
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(offer)
    );

    await flushCandidates(peerConnection);

    /*
     * Create ANSWER
     */
    const answer =
      await peerConnection.createAnswer();

    await peerConnection.setLocalDescription(
      answer
    );

    /*
     * Send ANSWER back
     */
    const message: SignalMessage = {
      type: "answer",
      answer,
    };

    socket.send(
      JSON.stringify(message)
    );
  };

  /*
   * Handle incoming ANSWER
   */
  const handleAnswer = async (
    answer: RTCSessionDescriptionInit
  ) => {
    const peerConnection =
      peerConnectionRef.current;

    if (!peerConnection) {
      return;
    }

    console.log("Received answer");

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );

    await flushCandidates(peerConnection);
  };

  /*
   * Handle ICE candidate
   */
  const handleCandidate = async (
    candidate: RTCIceCandidateInit
  ) => {
    const peerConnection =
      peerConnectionRef.current;

    if (!peerConnection) {
      return;
    }

    console.log(
      "Received ICE candidate"
    );

    // remote SDP not set yet — buffer until it is, else addIceCandidate is dropped
    if (!peerConnection.remoteDescription) {
      pendingCandidates.current.push(
        candidate
      );
      return;
    }

    try {
      await peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (error) {
      console.error(
        "Failed to add ICE candidate:",
        error
      );
    }
  };

  const flushCandidates = async (
    peerConnection: RTCPeerConnection
  ) => {
    for (const candidate of pendingCandidates.current) {
      try {
        await peerConnection.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (error) {
        console.error(
          "Failed to add ICE candidate:",
          error
        );
      }
    }
    pendingCandidates.current = [];
  };

  /*
   * Start the call
   */
  const call = async () => {
    const peerConnection =
      peerConnectionRef.current;

    const socket =
      socketRef.current;

    if (!peerConnection || !socket) {
      return;
    }

    console.log("Creating offer");

    /*
     * Create SDP OFFER
     */
    const offer =
      await peerConnection.createOffer();

    /*
     * Save our local description
     */
    await peerConnection.setLocalDescription(
      offer
    );

    /*
     * Send offer to Go server
     */
    const message: SignalMessage = {
      type: "offer",
      offer,
    };

    socket.send(
      JSON.stringify(message)
    );
  };

  /*
   * Cleanup
   */
  const cleanup = () => {
    socketRef.current?.close();

    peerConnectionRef.current?.close();

    localStreamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });
  };

  return (
    <div className="room">
      <h1>Room: {roomId}</h1>

      <p>
        Signaling:{" "}
        {connected
          ? "Connected 🟢"
          : "Disconnected 🔴"}
      </p>

      <div className="videos">
        <div>
          <h3>You</h3>

          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
          />
        </div>

        <div>
          <h3>Remote</h3>

          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
          />
        </div>
      </div>

      <button onClick={call}>
        Start Call
      </button>
    </div>
  );
}

export default Room;
