import type { State } from './types';

export async function api<T = State>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`/api${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : result.message || '操作失败，请重试');
    return result as T;
  } catch (error) {
    if (error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError')) throw new Error('本地服务连接中断，请确认服务已启动后重试');
    throw error;
  } finally { clearTimeout(timer); }
}
