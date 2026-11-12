import { createBrowserRouter, RouterProvider } from 'react-router';
import { CourseRedirect, LessonRedirect, RequireLecturer, RequireSignedIn, RequireStudent } from './components/guards';
import AdminPage from './pages/AdminPage';
import AssignmentAdminPage from './pages/AssignmentAdminPage';
import AssignmentPage from './pages/AssignmentPage';
import CheckInPage from './pages/CheckInPage';
import CourseHubPage from './pages/CourseHubPage';
import HomePage from './pages/HomePage';
import LessonPage from './pages/LessonPage';
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
  { path: '/lesson/:id', element: <RequireSignedIn><LessonPage /></RequireSignedIn> },
  { path: '/lecture/:id', element: <LessonRedirect /> },
  { path: '/admin', element: <AdminPage /> },
  { path: '/dash', element: <RequireLecturer><LecturerHomePage /></RequireLecturer> },
  { path: '/dash/course/:id', element: <CourseRedirect /> },
  { path: '/dash/assignment/:id', element: <RequireLecturer><AssignmentAdminPage /></RequireLecturer> },
  { path: '/hw/:id', element: <RequireLecturer><SubmissionPage /></RequireLecturer> },
  { path: '/dash/:id', element: <LessonRedirect /> },
  { path: '/projector/:id', element: <RequireLecturer><ProjectorPage /></RequireLecturer> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
