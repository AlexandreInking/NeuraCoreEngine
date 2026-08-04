import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch

def makePdf():
    path = r"c:\Users\Intel\Desktop\NeuraCoreEngine\Neura_Core_Ultra_Detailed_Spec.pdf"
    doc = SimpleDocTemplate(path, pagesize=letter,
        rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)

    s = getSampleStyleSheet()

    title = ParagraphStyle('T', fontName='Helvetica-Bold', fontSize=20,
        leading=24, textColor=colors.HexColor('#1E3A8A'), spaceAfter=4)
    subtitle = ParagraphStyle('ST', fontName='Helvetica-Bold', fontSize=11,
        leading=14, textColor=colors.HexColor('#475569'), spaceAfter=10)
    h2 = ParagraphStyle('H2', fontName='Helvetica-Bold', fontSize=13,
        leading=17, textColor=colors.HexColor('#0F172A'),
        spaceBefore=14, spaceAfter=5,
        borderPadding=(0,0,2,0))
    h3 = ParagraphStyle('H3', fontName='Helvetica-Bold', fontSize=11,
        leading=14, textColor=colors.HexColor('#1E40AF'),
        spaceBefore=10, spaceAfter=4)
    body = ParagraphStyle('B', fontName='Helvetica', fontSize=9,
        leading=13, textColor=colors.HexColor('#1E293B'), spaceAfter=5)
    bullet = ParagraphStyle('BU', fontName='Helvetica', fontSize=9,
        leading=13, textColor=colors.HexColor('#1E293B'), spaceAfter=3,
        leftIndent=14, bulletIndent=4)
    code = ParagraphStyle('C', fontName='Courier', fontSize=7.5,
        leading=10, textColor=colors.HexColor('#F8FAFC'),
        backColor=colors.HexColor('#0F172A'),
        borderPadding=8, spaceBefore=4, spaceAfter=8)
    math = ParagraphStyle('M', fontName='Courier-Bold', fontSize=9,
        leading=12, textColor=colors.HexColor('#1E3A8A'),
        backColor=colors.HexColor('#EFF6FF'),
        borderPadding=6, spaceBefore=4, spaceAfter=6)

    def hr(): return HRFlowable(width='100%', thickness=0.5,
        color=colors.HexColor('#CBD5E1'), spaceAfter=6, spaceBefore=6)

    def tbl(data, colWidths, headerRow=True):
        t = Table(data, colWidths=colWidths, repeatRows=1 if headerRow else 0)
        style = [
            ('GRID', (0,0), (-1,-1), 0.4, colors.HexColor('#E2E8F0')),
            ('PADDING', (0,0), (-1,-1), 5),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
            ('FONTSIZE', (0,0), (-1,-1), 8),
        ]
        if headerRow:
            style += [
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#E2E8F0')),
                ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ]
        t.setStyle(TableStyle(style))
        return t

    story = []

    story.append(Paragraph("NEURA-CORE ENGINE v2.0-ULTRA", title))
    story.append(Paragraph("Documento de Diseño Técnico de Alto Detalle (TDD / GDD)", subtitle))
    story.append(hr())

    metaData = [
        [Paragraph("<b>Proyecto:</b> Neura-Core Afectivo", body),
         Paragraph("<b>Autor:</b> Alejandro Espinoza (InKing Studio)", body)],
        [Paragraph("<b>Versión:</b> 2.0.0-ULTRA", body),
         Paragraph("<b>Fecha:</b> Agosto 2026", body)],
        [Paragraph("<b>Estado:</b> Producción", body),
         Paragraph("<b>Dominio:</b> B2B AI Engines / Gaming / Simulation", body)]
    ]
    story.append(tbl(metaData, [258, 258], headerRow=False))
    story.append(Spacer(1, 10))

    story.append(Paragraph("1. Arquitectura Topológica y Pipeline Event-Driven", h2))
    story.append(hr())
    story.append(Paragraph(
        "Neura-Core v2.0-ULTRA opera como un <b>Servidor Afectivo Centralizado</b> totalmente desacoplado "
        "del renderizado en cliente. La aplicación de escritorio Tauri contiene la UI React embebida y actúa como "
        "superficie principal; Unity, UE5, IVR y conexiones WebSocket/gRPC son integraciones externas opcionales, "
        "mientras Neura-Core gestiona la memoria, resolución afectiva y emisión de datos estructurados.", body))
    story.append(Paragraph("<b>SLAs de Producción (P99):</b>", body))
    story.append(Paragraph("• Affect Engine + Memory Query: &lt; 80ms", bullet))
    story.append(Paragraph("• First Token SSE Response: &lt; 350ms", bullet))
    story.append(Paragraph("• Sesiones concurrentes por nodo: 10,000", bullet))

    story.append(Spacer(1, 8))
    story.append(Paragraph("2. Especificación Detallada de Memoria Jerárquica (Modelo TencentDB)", h2))
    story.append(hr())
    story.append(Paragraph(
        "A diferencia de arquitecturas RAG convencionales (base de datos vectorial plana que produce "
        "mezcla de contextos y alucinaciones temporales), Neura-Core implementa 4 niveles de memoria continua.", body))

    story.append(Paragraph("2.1. Desglose Operativo por Capas de Memoria", h3))
    memHeaders = [
        Paragraph("<b>Nivel</b>", body), Paragraph("<b>Almacenamiento</b>", body),
        Paragraph("<b>Formato de Datos</b>", body), Paragraph("<b>Algoritmo de Ingesta</b>", body),
        Paragraph("<b>Costo Tokens</b>", body)
    ]
    memRows = [
        [Paragraph("<b>L0: Raw Log</b>", body), Paragraph("Redis In-Memory Buffer (Cluster)", body),
         Paragraph("JSON / Circular Array (Timestamp, Speaker, Text, Pitch)", body),
         Paragraph("Sliding Window 10 msgs. TTL 24h.", body),
         Paragraph("~1,000-2,500 tokens", body)],
        [Paragraph("<b>L1: Atomic Facts</b>", body), Paragraph("Qdrant Vector DB / Milvus + Metadata", body),
         Paragraph("Vector + JSON Payload (Sujeto-Predicado-Objeto)", body),
         Paragraph("LLM Worker asíncrono cada N turnos; extrae tripletas.", body),
         Paragraph("~200-500 tokens (Top-K=5)", body)],
        [Paragraph("<b>L2: Scenario Nodes</b>", body), Paragraph("Neo4j Graph DB + Markdown Files", body),
         Paragraph("Grafo Relacional + Markdown AST / Mermaid", body),
         Paragraph("Clustering semántico: 3+ hechos L1 comparten contexto → crea nodo L2.", body),
         Paragraph("~300-800 tokens (Nodo activo)", body)],
        [Paragraph("<b>L3: Core Persona</b>", body), Paragraph("Flat .md / PostgreSQL", body),
         Paragraph("Documento JSON (Prompt Base, Reglas Éticas)", body),
         Paragraph("Actualización asíncrona vía cronjobs nocturnos desde L2.", body),
         Paragraph("~500-1,200 tokens (Constante)", body)],
    ]
    story.append(tbl([memHeaders] + memRows, [68, 100, 110, 130, 100]))

    story.append(Paragraph("2.2. Memoria Corta Simbólica (Mermaid Execution Canvas)", h3))
    story.append(Paragraph(
        "Cuando el agente invoca herramientas externas (APIs, pasarelas de pago, bases de datos), "
        "Neura-Core intercepta la respuesta JSON y la comprime en abstracción simbólica Mermaid:", body))
    story.append(Paragraph(
        "Ejemplo comprimido (85% reducción de tokens):<br/>"
        "graph TD; A[Inicio Reembolso]-->B{Gold?}; B-->|Sí| C[Stripe Refund ID_8921]; "
        "C-->E[HTTP 200 OK]; B-->|No| D[Escalar a Soporte];", code))
    story.append(Paragraph(
        "• <b>Drill-Down:</b> Si nodo C falla (HTTP 500), el agente emite <b>DRILL_DOWN(node_id='C')</b> "
        "recuperando solo el log crudo Redis de esa llamada.", bullet))

    story.append(Paragraph("3. Especificación Matemática del Motor Afectivo (Matriz VAD)", h2))
    story.append(hr())
    story.append(Paragraph("<b>Definición de Ejes:</b>", body))
    story.append(Paragraph("• Valence (V) [-1.0, +1.0]: Cualidad del afecto (-1.0 sufrimiento → +1.0 satisfacción).", bullet))
    story.append(Paragraph("• Arousal (A) [-1.0, +1.0]: Activación neurofisiológica (-1.0 calma → +1.0 excitación/ira).", bullet))
    story.append(Paragraph("• Dominance (D) [-1.0, +1.0]: Control percibido (-1.0 sumisión → +1.0 autoridad).", bullet))

    story.append(Paragraph("3.2. Decay Function (Tick Conversacional):", h3))
    story.append(Paragraph(
        "E_t = E_(t-1) + alpha * DeltaE_stimulus - Gamma * (E_(t-1) - E_baseline) + eta(t)", math))
    story.append(Paragraph(
        "alpha ∈ [0.1, 0.4] = coeficiente de reactividad | "
        "Gamma = tasa de decaimiento inercial | "
        "eta(t) ~ N(0, Q) = ruido micro-afectivo estocástico", body))

    story.append(Paragraph("3.3. Cuadrantes Emocionales y Moduladores Vocal/UI", h3))
    emoHeaders = [Paragraph("<b>Centroide</b>", body), Paragraph("<b>VAD Target</b>", body),
                  Paragraph("<b>Pitch</b>", body), Paragraph("<b>Rate</b>", body),
                  Paragraph("<b>Vol</b>", body), Paragraph("<b>UI Color</b>", body)]
    emoRows = [
        [Paragraph("Calma Profesional", body), Paragraph("(0.00,-0.20,+0.20)", body),
         Paragraph("1.00x", body), Paragraph("1.00x", body), Paragraph("0 dB", body), Paragraph("#64748B Slate", body)],
        [Paragraph("Empatía / Calidez", body), Paragraph("(+0.65,+0.10,+0.20)", body),
         Paragraph("1.04x", body), Paragraph("0.95x", body), Paragraph("-1 dB", body), Paragraph("#F59E0B Amber", body)],
        [Paragraph("Frustración / Ira", body), Paragraph("(-0.85,+0.80,+0.60)", body),
         Paragraph("0.92x", body), Paragraph("1.25x", body), Paragraph("+4 dB", body), Paragraph("#EF4444 Crimson", body)],
        [Paragraph("Ansiedad / Miedo", body), Paragraph("(-0.60,+0.70,-0.70)", body),
         Paragraph("1.15x", body), Paragraph("1.30x", body), Paragraph("-2 dB", body), Paragraph("#A855F7 Purple", body)],
        [Paragraph("Tristeza / Apología", body), Paragraph("(-0.50,-0.60,-0.50)", body),
         Paragraph("0.88x", body), Paragraph("0.80x", body), Paragraph("-3 dB", body), Paragraph("#3B82F6 Blue", body)],
        [Paragraph("Entusiasmo / Éxito", body), Paragraph("(+0.85,+0.85,+0.50)", body),
         Paragraph("1.10x", body), Paragraph("1.12x", body), Paragraph("+2 dB", body), Paragraph("#10B981 Emerald", body)],
    ]
    story.append(tbl([emoHeaders] + emoRows, [88, 90, 42, 42, 42, 90]))

    story.append(Paragraph("4. Payloads de Producción (Input / Output JSON)", h2))
    story.append(hr())
    story.append(Paragraph("4.1. Payload de Entrada (Client Request Event):", h3))
    inputJson = (
        '{"client_id":"unity-game-instance-9021","session_id":"sess-8849-ax2-2026",<br/>'
        '"agent_id":"neura-npc-merchant-v1","timestamp":1785675530,<br/>'
        '"input_payload":{"type":"AUDIO_TRANSCRIPTION",<br/>'
        '"raw_text":"¡Es un robo! Tu poción costaba 50 monedas la semana pasada...",<br/>'
        '"sentiment_hint_from_stt":{"audio_pitch_avg":240.5,"audio_volume_db":12.4,"perceived_user_arousal":0.85}},<br/>'
        '"client_context":{"location_id":"town_square_shop","in_game_time":"14:30","user_reputation_score":-12}}'
    )
    story.append(Paragraph(inputJson, code))

    story.append(Paragraph("4.2. Payload de Salida (Cognitive & Affective Output):", h3))
    outputJson = (
        '{"event_id":"evt-99102-neura","agent_id":"neura-npc-merchant-v1",<br/>'
        '"execution_latency_ms":184,<br/>'
        '"affect_state":{"primary_emotion":"DEFENSIVE_ANGER",<br/>'
        '"vad_vector":{"valence":-0.72,"arousal":0.78,"dominance":0.65},<br/>'
        '"delta_applied":{"valence_change":-0.35,"arousal_change":0.40,"dominance_change":0.15},<br/>'
        '"emotional_intensity":0.82,"ui_visual_cue":{"hex_color":"#DC2626","pulse_frequency_hz":2.5}},<br/>'
        '"memory_trace":{"active_l2_scenario":"MERCHANT_PRICE_HAGGLING",<br/>'
        '"retrieved_l1_facts":["user_previously_stole_an_apple","potion_ingredients_increased_due_to_dragon_event"],<br/>'
        '"memory_drilldown_used":false},<br/>'
        '"cognitive_output":{"internal_thought":"El cliente me insultó y tiene mala reputación. No cederé.",<br/>'
        '"response_text":"¡Cuida tu lengua en mi tienda! Las raíces de mandrágora subieron...",<br/>'
        '"speech_synthesis_config":{"engine":"ELEVEN_LABS_STREAMING","voice_id":"Merchant_Garrick_v2",<br/>'
        '"pitch_modifier":0.92,"rate_modifier":1.18,"volume_gain_db":3.5}},<br/>'
        '"behavioral_triggers":{"animation_tag":"GESTURE_POINT_FINGER_ANGRY",<br/>'
        '"facial_blendshape_preset":"EXPRESSION_ANGRY_INTENSE",<br/>'
        '"client_events":[{"event_name":"PLAY_SFX_TABLE_SLAM","delay_ms":100},<br/>'
        '{"event_name":"MODIFY_NPC_DISCOUNT_PERCENT","value":0}]}}'
    )
    story.append(Paragraph(outputJson, code))

    story.append(Paragraph("5. Casos de Uso Empresariales (Verticales B2B)", h2))
    story.append(hr())

    b2bHeaders = [Paragraph("<b>Vertical</b>", body), Paragraph("<b>Escenario</b>", body),
                  Paragraph("<b>Dinámica Clave Neura-Core</b>", body)]
    b2bRows = [
        [Paragraph("Enterprise HR / Customer Support", body),
         Paragraph("Entrenamiento de ejecutivos en manejo de crisis (vuelos cancelados, disputas).", body),
         Paragraph("Cliente VAD (-0.80,+0.85,+0.40). El motor evalúa en tiempo real la reducción de arousal y emite EQ Score final.", body)],
        [Paragraph("EdTech / Salud Clínica", body),
         Paragraph("Simulaciones de entrevistas clínicas para estudiantes de psicología.", body),
         Paragraph("L2 garantiza consistencia de síntomas durante entrevistas 45+ min sin alterar historial.", body)],
        [Paragraph("Gaming & Metaverse RPG", body),
         Paragraph("NPCs autónomos de alta fidelidad en mundos virtuales interactivos.", body),
         Paragraph("Cliente gráfico solo procesa animaciones (FSM). Neura-Core gestiona toda la cognición en la nube.", body)],
    ]
    story.append(tbl([b2bHeaders] + b2bRows, [108, 156, 236]))

    story.append(Paragraph("6. Roadmap de Despliegue de Infraestructura", h2))
    story.append(hr())
    roadmap = [
        [Paragraph("<b>Fase</b>", body), Paragraph("<b>Período</b>", body),
         Paragraph("<b>Componentes</b>", body), Paragraph("<b>Meta Técnica</b>", body)],
        [Paragraph("Fase 1: Memory Subsystem", body), Paragraph("Meses 1-2", body),
         Paragraph("Redis Cluster + Qdrant Vector DB + Mermaid Compression Engine", body),
         Paragraph("Retrieval P99 &lt; 45ms", body)],
        [Paragraph("Fase 2: Affect Core Engine", body), Paragraph("Meses 3-4", body),
         Paragraph("Matriz VAD Rust / ElevenLabs SSML Streaming / EKF Pipeline", body),
         Paragraph("1,000 req/sec por nodo", body)],
        [Paragraph("Fase 3: B2B SDKs & APIs", body), Paragraph("Meses 5-6", body),
         Paragraph("Unity C# Plugin, Unreal Engine 5 C++ Subsystem, Dashboard Analítico B2B", body),
         Paragraph("SDK v1.0 stable + SLA 99.9%", body)],
    ]
    story.append(tbl(roadmap, [105, 55, 200, 120]))

    doc.build(story)
    print("PDF generated successfully.")

if __name__ == '__main__':
    makePdf()
