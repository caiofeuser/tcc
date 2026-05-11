# TCC Agent Instructions

- Keep responses concise, but explain technical reasoning clearly.
- Do not apply code or text changes until explicitly told to do so.
- When asked "from first principles", explain from the beginning.
- When typechecking, use `pnpm run typecheck:go` or `pnpm --filter=app run typecheck:go`.

## Thesis Memory

Before planning, writing, or changing anything related to the bachelor thesis, read:

`/Users/caiofeuser/Library/Mobile Documents/iCloud~md~obsidian/Documents/Default/1-Quick Notes/TCC Codex Memory.md`

Use it as the source of truth for thesis direction, official objectives, scope, repositories, robot/manual/client context, assumptions, and next actions.

If memory conflicts with a newer user message, follow the newer user message. Update memory only when instructed.

Separate official thesis text from internal planning notes.

## Thesis Direction

The thesis is a Mechanical Engineering project about a local multimodal assistant for guided Epson robot operation. Do not frame it as a generic AI assistant. The engineering problem is reducing operator error, time, and dependence on manual lookup while executing a robot procedure.

Confirmed scope:

- Robot: `EPSON T6-B602S`.
- Teach pendant: `Epson TP3`.
- Manual: Epson TP3 manual for the RC700A controller.
- Main procedure: move the robot arm to a specific coordinate.
- Keep scope narrow: one robot, one manual, one or two procedures, one or two local model candidates, checklist-based evaluation.
- Computer vision/object detection experiments are legacy context, not part of the current planned implementation.

## Technical Decisions

Approved stack:

- Backend: TypeScript + Hono running locally on Bun.
- AI/model layer: Vercel AI SDK Core.
- Runtime model access: Ollama or another local OpenAI-compatible endpoint.
- RAG storage: Postgres + pgvector.
- Database layer: Drizzle.
- RAG ingestion: TypeScript script.
- Chunking: LangChain JS text splitters.
- Embeddings: AI SDK `embedMany` for ingestion and `embed` for runtime queries.
- Optional reranking: AI SDK `rerank`, if the selected provider supports it.
- Speech-to-text: push-to-talk audio from glasses transcribed through local `whisper.cpp`, called by the TypeScript backend.

Runtime flow:

1. Receive push-to-talk audio and current image from the glasses/client.
2. Store the image as an artifact.
3. Transcribe audio locally when used.
4. Load session memory, active task memory, and relevant artifact references.
5. Call the model through AI SDK with question, image, and task context.
6. Let the model call tools when needed.
7. Stream a grounded answer back to the client, optionally with structured procedure state.

Planned model tools:

- `useRag(query)`: retrieve cited Epson manual sections. This is the grounding mechanism.
- `createProceduralPlan(task, retrievedContext)`: create multi-step procedures only when needed and grounded in retrieved context.
- `askUser(question)`: request missing information, clarification, or step confirmation.
- `getImage(imageRef)`: retrieve a stored image artifact when older visual context is needed.

Important behavior:

- Do not trust the model to answer procedural or safety-relevant robot questions from memory when manual context can be retrieved.
- Simple questions should receive direct grounded answers.
- Procedural questions requiring more than two ordered steps should become application-owned multi-step tasks.
- The backend owns task state: `activeTaskId`, generated steps, `currentStepIndex`, status, messages, and image references.
- The user must confirm each step through UI or voice before the backend advances task state.

## Evaluation Decisions

Build first; formal thesis writing comes later.

Current evaluation plan:

- Convert the coordinate-movement procedure into an official checklist.
- Define expected action, acceptance criteria, error criteria, and intervention criteria per step.
- Prepare around 20 predefined operator questions with expected manual section and answer type.
- Compare configurations: no RAG, RAG without reranking, and RAG with filtering/reranking.
- Run three to five guided execution trials if feasible.

Metrics:

- Retrieval Hit@1/Hit@3.
- Instruction correctness score: `0` incorrect/unsafe, `1` partial, `2` correct and usable.
- Task completion time.
- Checklist adherence: `correctStepsCompleted / totalRequiredSteps`.
- Wrong/skipped steps.
- External interventions.
- Response latency.
- Generated-procedure adherence.
- Step-confirmation accuracy.
- Local model resource usage when relevant.

## Next Priorities

1. Rebuild backend-related parts using Bun/Hono.
2. Implement RAG over the Epson manual before replacing or extending answer generation.
3. Transform the coordinate-movement procedure into the experimental checklist.
4. Define trial recording: video, backend logs, timing, responses, confirmations, and observations.
