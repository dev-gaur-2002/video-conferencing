import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
} from "react-router-dom";

import Room from "./components/Room";
import "./App.css";

function Home() {
  const navigate = useNavigate();

  const createRoom = () => {
    const roomId = Math.random()
      .toString(36)
      .substring(2, 8);

    navigate(`/room/${roomId}`);
  };

  return (
    <div className="home">
      <h1>WebRTC Video Call</h1>

      <button onClick={createRoom}>
        Create Room
      </button>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route
          path="/room/:roomId"
          element={<Room />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
