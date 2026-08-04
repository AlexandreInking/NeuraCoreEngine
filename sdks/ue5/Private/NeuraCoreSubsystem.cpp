// Neura-Core v2 SDK — Unreal Engine 5 (implementation, hito 8.6-8.7).

#include "NeuraCoreSubsystem.h"

#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "JsonObjectConverter.h"
#include "TimersManager.h"

void UNeuraCoreSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
}

void UNeuraCoreSubsystem::Deinitialize()
{
	StopAffectStream();
	Super::Deinitialize();
}

void UNeuraCoreSubsystem::StartAffectStream()
{
	if (PollTimer.IsValid())
	{
		return;
	}
	GetWorld()->GetTimerManager().SetTimer(
		PollTimer,
		this,
		&UNeuraCoreSubsystem::PollTick,
		0.25f,
		true);
}

void UNeuraCoreSubsystem::StopAffectStream()
{
	if (PollTimer.IsValid())
	{
		GetWorld()->GetTimerManager().ClearTimer(PollTimer);
		PollTimer.Invalidate();
	}
}

void UNeuraCoreSubsystem::PollTick()
{
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request =
		FHttpModule::Get().CreateRequest();
	Request->SetURL(GatewayUrl + TEXT("/v2/affect"));
	Request->SetVerb(TEXT("GET"));
	Request->SetHeader(TEXT("X-Tenant-Id"), TenantId);
	Request->SetHeader(TEXT("X-Api-Key"), ApiKey);
	Request->OnProcessRequestComplete().BindUObject(
		this, &UNeuraCoreSubsystem::HandleAffectResponse);
	Request->ProcessRequest();
}

void UNeuraCoreSubsystem::HandleAffectResponse(
	FHttpRequestPtr /*Request*/,
	FHttpResponsePtr Response,
	bool bConnected)
{
	if (!bConnected || !Response.IsValid() ||
		!EHttpResponseCodes::IsOk(Response->GetResponseCode()))
	{
		return;
	}

	// SSE: parsea el primer bloque "data:" (frame individual).
	const FString Body = Response->GetContentAsString();
	FString DataLine;
	if (!Body.Split(TEXT("data:"), nullptr, &DataLine))
	{
		return;
	}
	DataLine.TrimStartInline();

	FNeuraCorePayload Payload;
	if (FJsonObjectConverter::JsonObjectStringToUStruct(
			DataLine, &Payload, 0, 0))
	{
		OnAffectStateUpdated.Broadcast(Payload);
	}
}

void UNeuraCoreSubsystem::SendTurn(const FString& UserMessage)
{
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request =
		FHttpModule::Get().CreateRequest();
	Request->SetURL(GatewayUrl + TEXT("/v2/turn"));
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Request->SetHeader(TEXT("X-Tenant-Id"), TenantId);
	Request->SetHeader(TEXT("X-Api-Key"), ApiKey);

	const FString Body = FString::Printf(
		TEXT("{\"agent_id\":\"Neura\",\"user_message\":\"%s\",\"payload_json\":\"\"}"),
		*UserMessage.ReplaceCharWithEscapedChar());
	Request->SetContentAsString(Body);
	Request->OnProcessRequestComplete().BindUObject(
		this, &UNeuraCoreSubsystem::HandleTurnResponse);
	Request->ProcessRequest();
}

void UNeuraCoreSubsystem::HandleTurnResponse(
	FHttpRequestPtr /*Request*/,
	FHttpResponsePtr Response,
	bool bConnected)
{
	if (bConnected && Response.IsValid() &&
		EHttpResponseCodes::IsOk(Response->GetResponseCode()))
	{
		UE_LOG(LogTemp, Log, TEXT("NeuraCore turn accepted: %s"),
			*Response->GetContentAsString());
	}
}
