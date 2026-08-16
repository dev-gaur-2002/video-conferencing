export type SignalMessage = {
  type: "offer" | "answer" | "candidate";
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};
