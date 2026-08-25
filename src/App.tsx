import { Route, Routes } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import { AppShell } from './components/AppShell'
import { DashboardScreen } from './screens/DashboardScreen'
import { ScheduleScreen } from './screens/ScheduleScreen'
import { ExamsScreen } from './screens/ExamsScreen'
import { TasksScreen } from './screens/TasksScreen'
import { PersonalScreen } from './screens/PersonalScreen'
import { CoursesScreen } from './screens/CoursesScreen'
import { AttendanceScreen } from './screens/AttendanceScreen'
import { AssistantScreen } from './screens/AssistantScreen'
import { ImportScreen } from './screens/ImportScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { MoreScreen } from './screens/MoreScreen'

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardScreen />} />
          <Route path="/schedule" element={<ScheduleScreen />} />
          <Route path="/exams" element={<ExamsScreen />} />
          <Route path="/tasks" element={<TasksScreen />} />
          <Route path="/personal" element={<PersonalScreen />} />
          <Route path="/courses" element={<CoursesScreen />} />
          <Route path="/attendance" element={<AttendanceScreen />} />
          <Route path="/assistant" element={<AssistantScreen />} />
          <Route path="/import" element={<ImportScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/more" element={<MoreScreen />} />
        </Route>
      </Routes>
    </MotionConfig>
  )
}
