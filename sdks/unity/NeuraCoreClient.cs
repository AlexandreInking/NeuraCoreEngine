// Neura-Core v2 SDK — Unity (hito 8.6-8.7)
// Código de referencia compilable en Unity. Consume el gateway REST
// (127.0.0.1:8443) con auth X-Tenant-Id / X-Api-Key.

using System;
using UnityEngine;
using UnityEngine.Networking;
using System.Collections;

namespace NeuraCore.Sdk
{
    // ── Payload classes (NeuraCoreOutputPayload v1.0.0) ──────────────
    [Serializable]
    public class AffectState
    {
        public float valence;
        public float arousal;
        public float dominance;
        public string quadrant;
        public string hexColor;
        public string animationTag;
    }

    [Serializable]
    public class MemoryTrace
    {
        public int l0Entries;
        public int l1FactsUsed;
        public string l2Scenario;
        public string l3Profile;
    }

    [Serializable]
    public class CognitiveOutput
    {
        public string message;
        public float confidence;
        public string dominantSystem;
        public float internalConflict;
    }

    [Serializable]
    public class BehavioralTriggers
    {
        public string animationTag;
        public string uiHexColor;
        public bool proactive;
    }

    [Serializable]
    public class NeuraCorePayload
    {
        public string version;
        public string agentId;
        public string sessionId;
        public string timestamp;
        public AffectState affectState;
        public MemoryTrace memoryTrace;
        public CognitiveOutput cognitiveOutput;
        public BehavioralTriggers behavioralTriggers;
    }

    // ── Client: turn + affect polling ────────────────────────────────
    public class NeuraCoreClient : MonoBehaviour
    {
        [SerializeField] private string gatewayUrl = "http://127.0.0.1:8443";
        [SerializeField] private string tenantId = "default";
        [SerializeField] private string apiKey = "dev-key";
        [SerializeField] private float pollInterval = 0.25f;

        public event Action<NeuraCorePayload> OnAffectFrame;
        public AnimatorBridge animatorBridge;

        private void Start()
        {
            StartCoroutine(PollAffect());
        }

        private IEnumerator PollAffect()
        {
            while (true)
            {
                using (var request = UnityWebRequest.Get(gatewayUrl + "/v2/affect"))
                {
                    request.SetRequestHeader("X-Tenant-Id", tenantId);
                    request.SetRequestHeader("X-Api-Key", apiKey);
                    request.timeout = 2;
                    yield return request.SendWebRequest();
                    if (request.result == UnityWebRequest.Result.Success)
                    {
                        // SSE: toma el primer evento "affect" y parsea su data JSON.
                        var text = request.downloadHandler.text;
                        var payload = SseFirstFrame(text);
                        if (payload != null) OnAffectFrame?.Invoke(payload);
                    }
                }
                yield return new WaitForSeconds(pollInterval);
            }
        }

        private static NeuraCorePayload SseFirstFrame(string sseText)
        {
            foreach (var line in sseText.Split('\n'))
            {
                if (line.StartsWith("data:", StringComparison.Ordinal))
                {
                    try { return JsonUtility.FromJson<NeuraCorePayload>(line.Substring(5)); }
                    catch { return null; }
                }
            }
            return null;
        }

        public IEnumerator SendTurn(string userMessage, Action<bool> onResult)
        {
            var body = new NeuraCorePayload
            {
                version = "1.0.0",
                agentId = "Neura",
                sessionId = System.Guid.NewGuid().ToString(),
                timestamp = DateTime.UtcNow.ToString("o"),
                affectState = new AffectState { hexColor = "#8b93a7", animationTag = "GESTURE_NEUTRAL" },
                memoryTrace = new MemoryTrace(),
                cognitiveOutput = new CognitiveOutput { message = userMessage, confidence = 0f },
                behavioralTriggers = new BehavioralTriggers { uiHexColor = "#8b93a7", proactive = false },
            };
            using (var request = UnityWebRequest.Post(
                       gatewayUrl + "/v2/turn",
                       JsonUtility.ToJson(body),
                       "application/json"))
            {
                request.SetRequestHeader("X-Tenant-Id", tenantId);
                request.SetRequestHeader("X-Api-Key", apiKey);
                yield return request.SendWebRequest();
                onResult?.Invoke(request.result == UnityWebRequest.Result.Success);
            }
        }
    }

    // ── AnimatorBridge: aplica animationTag al Animator ──────────────
    public class AnimatorBridge : MonoBehaviour
    {
        [SerializeField] private Animator animator;

        public void Apply(NeuraCorePayload payload)
        {
            if (animator == null || payload?.affectState == null) return;
            var tag = payload.affectState.animationTag;
            animator.SetBool("IsAnimated", !string.IsNullOrEmpty(tag));
            animator.SetFloat("Valence", payload.affectState.valence);
            animator.SetFloat("Arousal", payload.affectState.arousal);
            animator.SetFloat("Dominance", payload.affectState.dominance);
        }
    }

    // ── UIBridge: color de UI desde uiHexColor ───────────────────────
    public class UIBridge : MonoBehaviour
    {
        [SerializeField] private UnityEngine.UI.Image target;

        public void Apply(NeuraCorePayload payload)
        {
            if (target == null || payload?.behavioralTriggers == null) return;
            if (ColorUtility.TryParseHtmlString(payload.behavioralTriggers.uiHexColor, out var color))
            {
                target.color = color;
            }
        }
    }
}
