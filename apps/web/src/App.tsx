import { createBrowserRouter, RouterProvider } from 'react-router';
import { RequireLecturer, RequireStudent } from './components/guards';
import CheckInPage from './pages/CheckInPage';
import DashboardPage from './pages/DashboardPage';
import HomePage from './pages/HomePage';
import LecturerHomePage from './pages/LecturerHomePage';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import ProjectorPage from './pages/ProjectorPage';

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/onboarding', element: <OnboardingPage /> },
  { path: '/c/:token', element: <RequireStudent><CheckInPage /></RequireStudent> },
  { path: '/dash', element: <RequireLecturer><LecturerHomePage /></RequireLecturer> },
  { path: '/dash/:id', element: <RequireLecturer><DashboardPage /></RequireLecturer> },
  { path: '/projector/:id', element: <RequireLecturer><ProjectorPage /></RequireLecturer> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
