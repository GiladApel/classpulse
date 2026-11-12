import { createBrowserRouter, RouterProvider } from 'react-router';
import { CourseRedirect, LessonRedirect, RequireLecturer, RequireSignedIn, RequireStudent } from './components/guards';
import AdminPage from './pages/AdminPage';
import AssignmentAdminPage from './pages/AssignmentAdminPage';
import AssignmentPage from './pages/AssignmentPage';
import CheckInPage from './pages/CheckInPage';
import CourseHubPage from './pages/CourseHubPage';
import DashboardPage from './pages/DashboardPage';
import HomePage from './pages/HomePage';
import LecturePage from './pages/LecturePage';
import LecturerHomePage from './pages/LecturerHomePage';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import ProjectorPage from './pages/ProjectorPage';
import RollCallPage from './pages/RollCallPage';
import SubmissionPage from './pages/SubmissionPage';

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/onboarding', element: <OnboardingPage /> },
  { path: '/c/:token', element: <RequireStudent><CheckInPage /></RequireStudent> },
  { path: '/r/:token', element: <RequireStudent><RollCallPage /></RequireStudent> },
  { path: '/course/:id', element: <RequireSignedIn><CourseHubPage /></RequireSignedIn> },
  { path: '/a/:id', element: <RequireStudent><AssignmentPage /></RequireStudent> },
  { path: '/lecture/:id', element: <RequireStudent><LecturePage /></RequireStudent> },
  { path: '/lesson/:id', element: <LessonRedirect /> },
  { path: '/admin', element: <AdminPage /> },
  { path: '/dash', element: <RequireLecturer><LecturerHomePage /></RequireLecturer> },
  { path: '/dash/course/:id', element: <CourseRedirect /> },
  { path: '/dash/assignment/:id', element: <RequireLecturer><AssignmentAdminPage /></RequireLecturer> },
  { path: '/hw/:id', element: <RequireLecturer><SubmissionPage /></RequireLecturer> },
  { path: '/dash/:id', element: <RequireLecturer><DashboardPage /></RequireLecturer> },
  { path: '/projector/:id', element: <RequireLecturer><ProjectorPage /></RequireLecturer> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
