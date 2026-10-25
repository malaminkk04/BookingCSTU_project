
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./pages/login";
import Homepage from "./pages/homepage";
import Mybooking from "./pages/Mybooking";
import Review from "./pages/review";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route path="/homepage" element={<Homepage />} />
        <Route path="/homepage.html" element={<Homepage />} />

        <Route path="/mybooking" element={<Mybooking />} />
        <Route path="/Mybooking.html" element={<Mybooking />} />

        <Route path="/review" element={<Review />} />
      </Routes>
    </Router>
  );
}

export default App;
