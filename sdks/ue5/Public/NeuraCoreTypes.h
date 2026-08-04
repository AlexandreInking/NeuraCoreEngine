// Neura-Core v2 — payload types (USTRUCT) for UE5 (hito 8.6-8.7).

#pragma once

#include "CoreMinimal.h"
#include "NeuraCoreTypes.generated.h"

USTRUCT(BlueprintType)
struct FNeuraCoreAffectState
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly)
	float Valence = 0.f;

	UPROPERTY(BlueprintReadOnly)
	float Arousal = 0.f;

	UPROPERTY(BlueprintReadOnly)
	float Dominance = 0.f;

	UPROPERTY(BlueprintReadOnly)
	FString Quadrant;

	UPROPERTY(BlueprintReadOnly)
	FString HexColor;

	UPROPERTY(BlueprintReadOnly)
	FString AnimationTag;
};

USTRUCT(BlueprintType)
struct FNeuraCorePayload
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly)
	FString Version;

	UPROPERTY(BlueprintReadOnly)
	FString AgentId;

	UPROPERTY(BlueprintReadOnly)
	FString SessionId;

	UPROPERTY(BlueprintReadOnly)
	FNeuraCoreAffectState AffectState;

	UPROPERTY(BlueprintReadOnly)
	int32 L1FactsUsed = 0;

	UPROPERTY(BlueprintReadOnly)
	FString L2Scenario;

	UPROPERTY(BlueprintReadOnly)
	FString Message;

	UPROPERTY(BlueprintReadOnly)
	FString UiHexColor;

	UPROPERTY(BlueprintReadOnly)
	bool bProactive = false;
};
