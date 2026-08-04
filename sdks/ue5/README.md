# Neura-Core v2 SDK — Unreal Engine 5

Código de referencia (hito 8.6-8.7) para integrar el motor cognitivo en un proyecto UE5.

## Requisitos
- UE 5.x con los módulos `HTTP`, `Json`, `JsonUtilities`, `Engine` en `Build.cs`.
- Gateway corriendo: `cargo run --bin neuracore-gateway` en `core/engine` (REST `8443`).

## Integración
1. Copia `Public/` y `Private/` a `Source/<TuModulo>/`.
2. En `Build.cs`: `PublicDependencyModuleNames.AddRange(new[] { "HTTP", "Json", "JsonUtilities", "Engine" });`
3. Desde cualquier Blueprint (o C++):

```cpp
// C++
UNeuraCoreSubsystem* Neura = GetGameInstance()->GetSubsystem<UNeuraCoreSubsystem>();
Neura->OnAffectStateUpdated.AddDynamic(this, &AMyActor::OnAffectChanged);
Neura->StartAffectStream();
```

```cpp
// Handler: aplica animationTag/hex a tu animación/UI
void AMyActor::OnAffectChanged(const FNeuraCorePayload& Payload)
{
    // Payload.AffectState.AnimationTag, .HexColor, Valence/Arousal/Dominance
    // Payload.UiHexColor, Payload.bProactive
}
```

## Blueprint node
`UNeuraCoreSubsystem` es `BlueprintAssignable` + `BlueprintCallable`, así que desde Event Graph puedes:
- `Get Game Instance → Get NeuraCore Subsystem → Start Affect Stream`
- Enlazar el evento `On Affect State Updated` al nodo.

## Auth
Headers `X-Tenant-Id: default` / `X-Api-Key: dev-key` (hito v0.9: JWT por tenant).
