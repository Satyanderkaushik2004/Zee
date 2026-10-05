import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../src/theme';

const tab = (name: string, title: string, icon: any) => (
  <Tabs.Screen name={name} options={{ title, tabBarIcon: ({ color, size }) => <Ionicons name={icon} color={color} size={size} /> }} />
);
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: C.bg }, headerTintColor: C.text, headerShadowVisible: false,
      tabBarStyle: { backgroundColor: C.card, borderTopColor: C.border },
      tabBarLabelStyle: { fontSize: 10 }, tabBarActiveTintColor: C.violet, tabBarInactiveTintColor: C.muted,
    }}>
      {tab('index', 'Home', 'home')}
      {tab('library', 'Library', 'albums')}
      {tab('ask', 'Ask Zee', 'sparkles')}
      {tab('reminders', 'Reminders', 'alarm')}
      {tab('track', 'Track', 'briefcase')}
      <Tabs.Screen name="collections" options={{ href: null, title: 'Collections' }} />
      {tab('settings', 'Settings', 'settings')}
    </Tabs>
  );
}
