'use strict';

// Serviço de IA do Sentinela. Mantém limites, cache e fallback local fora das rotas HTTP.

// ── Assistente IA (baseado em regras + prontuário; sem diagnóstico) ──
function buildLocalClinicalSummary(paciente, triagens, consultas, atendimentos) {
    const nome = paciente?.nome || "Paciente";
    const alergia = (triagens.slice(-1)[0]?.alergia) || "não informada";
    const nConsultas = consultas.length;
    const nTriagens = triagens.length;
    const ultConsulta = consultas.slice(-1)[0];
    const meds = [...new Set(consultas.map(c => String(c.medicacao || "").trim()).filter(Boolean))];
    const inconsistencias = [];
    if (alergia && alergia.toLowerCase() !== "nenhuma") {
        const conflito = consultas.find(c =>
            String(c.medicacao || "").toLowerCase().includes(String(alergia).toLowerCase().split(/[,;/]/)[0].trim())
            && String(alergia).trim().length >= 3
        );
        if (conflito) inconsistencias.push(`Divergência: medicação "${conflito.medicacao}" x alergia registrada "${alergia}" (consulta ${new Date(conflito.createdAt).toLocaleDateString("pt-BR")}). Recomenda-se revisão.`);
    }
    if (meds.length >= 5) inconsistencias.push(`Polifarmácia: ${meds.length} medicamentos distintos registrados. Revisar interações.`);
    if (!ultConsulta && nTriagens > 0) inconsistencias.push("Há triagem sem consulta vinculada — verificar fila médica.");

    let texto = `${nome}: ${nTriagens} triagem(ns), ${nConsultas} consulta(s). `;
    texto += `Alergia registrada: ${alergia}. `;
    if (meds.length) texto += `Medicamentos ativos/registrados: ${meds.slice(0, 5).join("; ")}. `;
    if (ultConsulta) texto += `Último registro: ${ultConsulta.diagnostico || "sem diagnóstico"} em ${new Date(ultConsulta.createdAt).toLocaleDateString("pt-BR")}. `;
    texto += `Fonte: prontuário do paciente. Esta análise é um apoio e não substitui avaliação clínica.`;
    return { resumo: texto, inconsistencias, geradoEm: new Date().toISOString() };
}

function normalizeAiPayload(content) {
    try {
        const parsed = JSON.parse(String(content || "").trim());
        if (parsed && typeof parsed === "object" && parsed.resumo) {
            return {
                resumo: parsed.resumo,
                inconsistencias: Array.isArray(parsed.inconsistencias) ? parsed.inconsistencias : [],
                geradoEm: parsed.geradoEm || new Date().toISOString()
            };
        }
    } catch (_) {}

    return {
        resumo: String(content || "").trim() || "Resumo não disponível no momento.",
        inconsistencias: [],
        geradoEm: new Date().toISOString()
    };
}

// ============================================================
// SENTINELA AI — RACIONAMENTO DE TOKENS
// ============================================================

const AI_MAX_INPUT_CHARS = 12000;
const AI_MAX_OUTPUT_TOKENS = 350;

const AI_CACHE_TTL_MS = 5 * 60 * 1000;

const AI_MAX_REQUESTS_PER_WINDOW = 10;
const AI_RATE_WINDOW_MS = 10 * 60 * 1000;

const aiCache = new Map();
const aiRateLimit = new Map();


// ------------------------------------------------------------
// Limita textos
// ------------------------------------------------------------

function aiTrim(value, max = 300) {
    const text = String(value ?? "").trim();

    if (text.length <= max) {
        return text;
    }

    return text.slice(0, max) + "...";
}


// ------------------------------------------------------------
// Últimos registros
// ------------------------------------------------------------

function aiLastItems(array, limit) {
    if (!Array.isArray(array)) {
        return [];
    }

    return array.slice(-limit);
}


// ------------------------------------------------------------
// Remove campos desnecessários
// ------------------------------------------------------------

function compactAiRecord(record) {

    if (!record || typeof record !== "object") {
        return {};
    }

    const allowedFields = [
        "id",
        "createdAt",
        "updatedAt",
        "status",
        "temperatura",
        "pressao",
        "pas",
        "pad",
        "frequencia",
        "fc",
        "saturacao",
        "spo2",
        "fr",
        "peso",
        "altura",
        "alergia",
        "queixa",
        "sintomas",
        "observacoes",
        "obs",
        "diagnostico",
        "medicacao",
        "prescricao",
        "conduta",
        "motivo",
        "tipo",
        "resultado"
    ];

    const result = {};

    for (const field of allowedFields) {

        if (
            record[field] !== undefined &&
            record[field] !== null &&
            record[field] !== ""
        ) {

            if (typeof record[field] === "string") {
                result[field] =
                    aiTrim(record[field], 300);
            } else {
                result[field] =
                    record[field];
            }
        }
    }

    return result;
}


// ------------------------------------------------------------
// Monta contexto reduzido
// ------------------------------------------------------------

function buildCompactAiContext(
    paciente,
    triagens,
    consultas,
    atendimentos
) {

    const context = {

        paciente: {
            nome: aiTrim(paciente?.nome, 100),
            cpf: aiTrim(paciente?.cpf, 30),
            status: aiTrim(paciente?.status, 50)
        },

        triagens:
            aiLastItems(triagens, 3)
                .map(compactAiRecord),

        consultas:
            aiLastItems(consultas, 4)
                .map(compactAiRecord),

        atendimentos:
            aiLastItems(atendimentos, 2)
                .map(compactAiRecord)
    };


    let serialized =
        JSON.stringify(context);


    if (
        serialized.length >
        AI_MAX_INPUT_CHARS
    ) {

        serialized =
            serialized.slice(
                0,
                AI_MAX_INPUT_CHARS
            ) +
            "\n[Dados adicionais omitidos]";
    }


    return serialized;
}


// ------------------------------------------------------------
// Rate limit
// ------------------------------------------------------------

function canUseAI(userKey) {

    const key =
        String(userKey || "anonymous");

    const now =
        Date.now();

    let entry =
        aiRateLimit.get(key);


    if (!entry) {

        entry = {
            startedAt: now,
            requests: 0
        };

        aiRateLimit.set(
            key,
            entry
        );
    }


    if (
        now - entry.startedAt >
        AI_RATE_WINDOW_MS
    ) {

        entry.startedAt = now;
        entry.requests = 0;
    }


    if (
        entry.requests >=
        AI_MAX_REQUESTS_PER_WINDOW
    ) {

        return false;
    }


    entry.requests++;

    return true;
}


// ------------------------------------------------------------
// Cache
// ------------------------------------------------------------

function getCachedAI(cacheKey) {

    const cached =
        aiCache.get(cacheKey);


    if (!cached) {
        return null;
    }


    if (
        Date.now() - cached.createdAt >
        AI_CACHE_TTL_MS
    ) {

        aiCache.delete(cacheKey);

        return null;
    }


    return cached.value;
}


function setCachedAI(cacheKey, value) {

    aiCache.set(
        cacheKey,
        {
            createdAt: Date.now(),
            value
        }
    );


    if (aiCache.size > 100) {

        const firstKey =
            aiCache.keys().next().value;

        if (firstKey) {
            aiCache.delete(firstKey);
        }
    }
}


// ============================================================
// RESUMO IA
// ============================================================

async function resumoIA(
    paciente,
    triagens,
    consultas,
    atendimentos,
    user
) {

    const apiKey =
        String(
            process.env.GEMINI_API_KEY || ""
        ).trim();


    const apiUrl =
        String(
            process.env.AI_API_URL ||
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        ).trim();


    const model =
        String(
            process.env.AI_MODEL ||
            "gemini-3.6-flash"
        ).trim();


    const localSummary =
        buildLocalClinicalSummary(
            paciente,
            triagens,
            consultas,
            atendimentos
        );


    // --------------------------------------------------------
    // Sem chave
    // --------------------------------------------------------

    if (!apiKey) {

        console.error(
            "[Sentinela AI] GEMINI_API_KEY não configurada."
        );

        return {
            ...localSummary,
            origem: "local",
            iaDisponivel: false,
            erroIA:
                "GEMINI_API_KEY não configurada."
        };
    }


    // --------------------------------------------------------
    // Rate limit
    // --------------------------------------------------------

    const userKey =
        user?.usuario ||
        user?.email ||
        "anonymous";


    if (!canUseAI(userKey)) {

        return {
            ...localSummary,

            origem: "local",

            iaDisponivel: false,

            rateLimit: true,

            erroIA:
                "Limite de uso da IA atingido. Tente novamente mais tarde."
        };
    }


    // --------------------------------------------------------
    // Contexto reduzido
    // --------------------------------------------------------

    const compactContext =
        buildCompactAiContext(
            paciente,
            triagens,
            consultas,
            atendimentos
        );


    // --------------------------------------------------------
    // Cache
    // --------------------------------------------------------

    const cacheKey =
        `${paciente?.cpf || paciente?.id}:${compactContext}`;


    const cached =
        getCachedAI(cacheKey);


    if (cached) {

        console.log(
            "[Sentinela AI] Resultado recuperado do cache."
        );

        return {
            ...cached,
            cache: true
        };
    }


    console.log("");
    console.log(
        "========================================"
    );

    console.log(
        "[Sentinela AI] Nova requisição"
    );

    console.log(
        "[Sentinela AI] Modelo:",
        model
    );

    console.log(
        "[Sentinela AI] Entrada:",
        compactContext.length,
        "caracteres"
    );

    console.log(
        "[Sentinela AI] Saída máxima:",
        AI_MAX_OUTPUT_TOKENS,
        "tokens"
    );

    console.log(
        "========================================"
    );


    try {

        const response =
            await fetch(
                apiUrl,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${apiKey}`
                    },

                    body: JSON.stringify({

                        model,

                        messages: [

                            {
                                role: "system",

                                content: `
Você é o Sentinela AI.

Analise o prontuário fornecido.

Produza um resumo clínico extremamente objetivo.

REGRAS:

- Não diagnostique.
- Não prescreva medicamentos.
- Não invente informações.
- Não repita informações.
- Priorize registros recentes.
- Aponte apenas inconsistências relevantes.
- Responda em português brasileiro.
- O resumo deve ter no máximo aproximadamente 100 palavras.

Retorne SOMENTE JSON:

{
  "resumo": "Resumo objetivo.",
  "inconsistencias": [
    "Inconsistência relevante."
  ]
}
                                `.trim()
                            },

                            {
                                role: "user",

                                content:
                                    compactContext
                            }

                        ],

                        temperature: 0.2,

                        max_tokens:
                            AI_MAX_OUTPUT_TOKENS
                    })
                }
            );


        console.log(
            "[Sentinela AI] HTTP:",
            response.status
        );


        const rawText =
            await response.text();


        if (!response.ok) {

            console.error(
                "[Sentinela AI] Erro da Gemini:"
            );

            console.error(rawText);

            return {

                ...localSummary,

                origem: "local",

                iaDisponivel: false,

                erroIA:
                    `Gemini respondeu HTTP ${response.status}.`
            };
        }


        let payload;


        try {

            payload =
                JSON.parse(rawText);

        } catch (_) {

            return {

                ...localSummary,

                origem: "local",

                iaDisponivel: false,

                erroIA:
                    "A Gemini retornou uma resposta inválida."
            };
        }


        const aiContent =

            payload
                ?.choices
                ?.[0]
                ?.message
                ?.content

            ||

            payload?.output_text

            ||

            payload?.content

            ||

            payload
                ?.message
                ?.content

            ||

            "";


        if (!aiContent) {

            return {

                ...localSummary,

                origem: "local",

                iaDisponivel: false,

                erroIA:
                    "A Gemini respondeu sem conteúdo."
            };
        }


        const parsed =
            normalizeAiPayload(
                aiContent
            );


        const result = {

            resumo:
                parsed.resumo ||
                localSummary.resumo,

            inconsistencias:
                Array.isArray(
                    parsed.inconsistencias
                )
                    ? parsed.inconsistencias
                    : localSummary.inconsistencias,

            geradoEm:
                new Date().toISOString(),

            origem:
                "gemini",

            iaDisponivel:
                true,

            erroIA:
                null,

            cache:
                false
        };


        setCachedAI(
            cacheKey,
            result
        );


        console.log(
            "[Sentinela AI] Gemini respondeu com sucesso."
        );

        console.log(
            "[Sentinela AI] Resultado salvo no cache."
        );


        return result;

    } catch (error) {

        console.error(
            "[Sentinela AI] Falha ao chamar Gemini:",
            error
        );

        return {

            ...localSummary,

            origem: "local",

            iaDisponivel: false,

            erroIA:
                error.message ||
                "Erro ao conectar à Gemini."
        };
    }
}

module.exports = { resumoIA, buildLocalClinicalSummary, normalizeAiPayload };
