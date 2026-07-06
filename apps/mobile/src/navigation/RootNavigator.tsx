import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { StudyScreen } from '../screens/StudyScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { useAuthStore } from '../bootstrap';
import type { RootStackParamList, TabParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const darkTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: '#0C0E16',
    card: '#0C0E16',
    text: '#E8EAED',
    border: '#141820',
    primary: '#4FC3F7',
    notification: '#FFB74D',
  },
};

function MainTabs(): React.ReactElement {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#141820',
          borderTopColor: '#1E2330',
        },
        tabBarActiveTintColor: '#4FC3F7',
        tabBarInactiveTintColor: '#7B8497',
      }}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ tabBarLabel: 'Главная' }} />
      <Tab.Screen name="LibraryTab" component={LibraryScreen} options={{ tabBarLabel: 'Слова' }} />
      <Tab.Screen name="StatsTab" component={StatsScreen} options={{ tabBarLabel: 'Стата' }} />
    </Tab.Navigator>
  );
}

export function RootNavigator(): React.ReactElement {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return (
    <NavigationContainer theme={darkTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <RootStack.Screen name="Home" component={MainTabs} />
            <RootStack.Screen
              name="Study"
              component={StudyScreen}
              options={{ presentation: 'modal' }}
            />
          </>
        ) : (
          <RootStack.Screen name="Login" component={LoginScreen} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
