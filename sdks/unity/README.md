# Neura-Core v2 SDK — Unity

Código de referencia (hito 8.6-8.7) para integrar el motor cognitivo de Neura-Core en un proyecto Unity.

## Requisitos
- Unity 2021.3+ (C# 9, `UnityWebRequest`)
- Gateway corriendo: `cargo run --bin neuracore-gateway` en `core/engine` (puertos REST `8443`, gRPC `50051`)

## Integración
1. Copia `NeuraCoreClient.cs` a `Assets/NeuraCore/`.
2. Crea un GameObject, añade `NeuraCoreClient` y opcionalmente `AnimatorBridge`/`UIBridge`.
3. Suscríbete al evento:

```csharp
var client = GetComponent<NeuraCoreClient>();
client.OnAffectFrame += payload =>
{
    animatorBridge.Apply(payload);   // animationTag + VAD → Animator
    uiBridge.Apply(payload);         // uiHexColor → Image
    Debug.Log($"VAD: V {payload.affectState.valence} A {payload.affectState.arousal}");
};
```

4. Envía turnos: `StartCoroutine(client.SendTurn("mensaje", ok => Debug.Log(ok)));`

## Qué recibe el motor del juego
- `affectState.animationTag` → animaciones (`GESTURE_ENTHUSIASTIC`, `GESTURE_POINT_FINGER_ANGRY`, …)
- `affectState.hexColor` / `behavioralTriggers.uiHexColor` → color de UI/aura
- `memoryTrace` → contexto (L2 activo, facts L1, perfil L3)

## Auth
Headers por defecto `X-Tenant-Id: default` y `X-Api-Key: dev-key` (hito v0.9 los sustituye por JWT por tenant).
