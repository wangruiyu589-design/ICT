export interface Zone { id: string; name: string; crop: string; area: number; moisture: number; targetMoisture: number; status: 'idle' | 'watering' | 'offline'; flow: number; pressure: number; battery: number; lastSeen: string; deviceId: string }
export interface Device { id: string; name: string; type: string; zoneId: string; status: 'online' | 'offline'; battery: number; signal: number; lastSeen: string }
export interface Plan { id: string; name: string; zoneIds: string[]; startTime: string; duration: number; days: number[]; enabled: boolean; lastRun?: string | null }
export interface Alert { id: string; title: string; detail: string; level: 'warning' | 'critical' | 'info'; zoneId: string | null; createdAt: string; acknowledged: boolean }
export interface Log { id: string; message: string; type: string; createdAt: string }
export interface Session { id: string; zoneId: string; startedAt: string; endsAt: string; duration: number; status: string }
export interface Settings { farmName: string; location: string; moistureThreshold: number; maxDuration: number }
export interface State { farm: { name: string; location: string; area: number }; zones: Zone[]; devices: Device[]; plans: Plan[]; alerts: Alert[]; logs: Log[]; history: { date: string; water: number; moisture: number }[]; sessions: Session[]; settings: Settings; weather: { temperature: number; humidity: number; wind: number; rainProbability: number; description: string }; updatedAt: string; mode: 'simulation' }
