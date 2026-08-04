// k6 smoke test (hito 9.6) — carga el gateway Neura-Core v2.
// Ejecutar: k6 run core/k6/smoke.js
// Umbrales: p95 < 500ms, error rate < 1%.

import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

export const options = {
  vus: 5,
  duration: '20s',
  thresholds: {
    turn_latency: ['p(95)<500'],
    turn_errors: ['rate<0.01'],
  },
};

const turnLatency = new Trend('turn_latency', true);
const turnErrors = new Rate('turn_errors');

const GATEWAY = __ENV.GATEWAY || 'http://127.0.0.1:8443';
const API_KEY = __ENV.API_KEY || 'dev-key';

const PAYLOAD = JSON.stringify({
  version: '1.0.0',
  agentId: 'load-test',
  sessionId: 'k6-session',
  timestamp: new Date().toISOString(),
  affectState: { valence: 0.2, arousal: 0.3, dominance: 0.1, quadrant: 'Q1', hexColor: '#10b981', animationTag: 'GESTURE_ENTHUSIASTIC' },
  memoryTrace: { l0Entries: 1, l1FactsUsed: 0, l2Scenario: null, l3Profile: null },
  cognitiveOutput: { message: 'load test', confidence: 0.5, dominantSystem: null, internalConflict: 0.1 },
  behavioralTriggers: { animationTag: 'GESTURE_ENTHUSIASTIC', uiHexColor: '#10b981', proactive: false },
});

export default function () {
  const started = Date.now();
  const response = http.post(
    `${GATEWAY}/v2/turn`,
    JSON.stringify({ agent_id: 'load-test', user_message: 'hola', payload_json: PAYLOAD }),
    { headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 'default', 'X-Api-Key': API_KEY } },
  );
  const latency = Date.now() - started;
  turnLatency.add(latency);

  const ok = response.status === 200;
  turnErrors.add(!ok);
  check(response, { 'status 200': (r) => r.status === 200 });
}
