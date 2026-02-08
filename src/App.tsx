import QuizLounge from './QuizLounge';
import EmbedRoom from './EmbedRoom';
import './App.css';

function App() {
  const path = window.location.pathname;
  const embedMatch = path.match(/^\/embed\/(.+)$/);

  if (embedMatch) {
    const roomName = decodeURIComponent(embedMatch[1]);
    return <EmbedRoom roomName={roomName} />;
  }

  return (
    <div className="app">
      <QuizLounge />
    </div>
  );
}

export default App;
