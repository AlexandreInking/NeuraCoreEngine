// Neura-Core v2 SDK — Unreal Engine 5 (hito 8.6-8.7)
// Código de referencia compilable en UE5 (FHttpModule). Consume el gateway
// REST (127.0.0.1:8443) con auth X-Tenant-Id / X-Api-Key.

#pragma once

#include "CoreMinimal.h"
#include "NeuraCoreTypes.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "NeuraCoreSubsystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnAffectStateUpdated, const FNeuraCorePayload&, Payload);

/**
 * GameInstance subsystem: polls the Neura-Core gateway and broadcasts
 * affect frames to Blueprints/animations.
 */
UCLASS()
class NEURACORE_API UNeuraCoreSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UPROPERTY(BlueprintAssignable, Category = "NeuraCore")
	FOnAffectStateUpdated OnAffectStateUpdated;

	/** Starts the affect stream (idempotent). */
	UFUNCTION(BlueprintCallable, Category = "NeuraCore")
	void StartAffectStream();

	/** Stops the affect stream. */
	UFUNCTION(BlueprintCallable, Category = "NeuraCore")
	void StopAffectStream();

	UFUNCTION(BlueprintCallable, Category = "NeuraCore")
	void SendTurn(const FString& UserMessage);

protected:
	void PollTick();
	void HandleAffectResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected);
	void HandleTurnResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected);

	FTimerHandle PollTimer;
	FString GatewayUrl = TEXT("http://127.0.0.1:8443");
	FString TenantId = TEXT("default");
	FString ApiKey = TEXT("dev-key");
};
