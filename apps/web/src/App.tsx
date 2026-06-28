import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomeScreen from './screens/HomeScreen';
import StudyScreen from './screens/StudyScreen';
import LibraryScreen from './screens/LibraryScreen';
import StatsScreen from './screens/StatsScreen';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/study" element={<StudyScreen />} />
        <Route path="/library" element={<LibraryScreen />} />
        <Route path="/stats" element={<StatsScreen />} />
      </Routes>
    </Layout>
  );
}
