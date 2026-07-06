import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore, api } from '../bootstrap';
import type { AuthResponse } from '@hanzi/shared';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen(_props: Props): React.ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const result = await api.post<AuthResponse & { refreshToken: string }>(
        path,
        { email, password },
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      useAuthStore.getState().login(result.data.user, result.data.accessToken, result.data.refreshToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>HanZi</Text>
      <Text style={styles.subtitle}>Китайские слова с интервальным повторением</Text>

      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, mode === 'login' && styles.tabActive]}
          onPress={() => setMode('login')}
        >
          <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Вход</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, mode === 'register' && styles.tabActive]}
          onPress={() => setMode('register')}
        >
          <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>
            Регистрация
          </Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#7B8497"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Пароль"
        placeholderTextColor="#7B8497"
        secureTextEntry
        autoCapitalize="none"
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.submit, submitting && styles.submitDisabled]}
        onPress={handleSubmit}
        disabled={submitting || !email || !password}
      >
        {submitting ? (
          <ActivityIndicator color="#0C0E16" />
        ) : (
          <Text style={styles.submitText}>
            {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </Text>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0E16',
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 48,
    fontWeight: '700',
    color: '#E8EAED',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#7B8497',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#141820',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#1E2330',
  },
  tabText: {
    color: '#7B8497',
    fontSize: 15,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#E8EAED',
  },
  input: {
    backgroundColor: '#141820',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#E8EAED',
    fontSize: 16,
    marginBottom: 12,
  },
  error: {
    color: '#E57373',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  submit: {
    backgroundColor: '#4FC3F7',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: '#0C0E16',
    fontSize: 16,
    fontWeight: '600',
  },
});
