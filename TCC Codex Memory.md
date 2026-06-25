# Bachelor Thesis Codex Memory

Updated: 2026-05-08

## Core Direction

Bachelor thesis in Mechanical Engineering about a multimodal assistant for guided robot operation using smart glasses, current image context, audio commands, local language models, and technical information retrieval.

The thesis should not be framed as "building a generic AI assistant." The stronger engineering framing is the development and experimental evaluation of an operational support system for a mechanical/industrial task: helping an operator execute a robot procedure with less dependence on traditional interfaces and manual lookup, using contextual instructions in real time.

## Existing/Legacy System Artifacts

- React/Vite web frontend in the `assembly-assitant` repository.
- Legacy Node/WebSocket backend in `assembly-assitant/server/server.js`; backend-related work will be rebuilt with Bun/Hono.
- Current Gemini integration for image/audio analysis and operator response generation.
- Legacy Python/FastAPI detection and backend experiments exist, including TFLite/YOLO artifacts, but computer vision/object detection is not part of the current planned thesis implementation.
- Python/FastAPI backend in `backend-cv/main/main.py`, with WebSocket, Whisper, Gemini, and a TFLite model, is legacy context rather than the target backend architecture.
- Kotlin Vuzix client at `/Users/caiofeuser/AndroidStudioProjects/Vuzix _external/app/src/main/java/com/example/vuzix/`, with camera capture, frame streaming, audio recording, WebSocket communication, and detection overlay.
- Epson Teach Pendant TP3 technical manual for the RC700A controller at `/Users/caiofeuser/Downloads/Documents/epson_teach_pendant_tp3_manual-rc700a(r13).pdf`.

Confirmed decisions and remaining notes:

- Robot confirmed for the experiment: EPSON T6-B602S.
- Teach pendant confirmed for the experiment: Epson TP3.
- Selected operational procedure: move the robot arm to a specific coordinate.
- The original repository list included `assembly-assitant` twice.

## Mechanical Engineering Angle

The thesis should be defended as Mechanical Engineering work because it deals with assisted operation of robotic equipment, technical procedures, operational safety, human-machine interfaces, and productivity in an industrial or laboratory environment.

The software is the means. The engineering problem is how to reduce error, time, and dependence on prior operator knowledge when executing a technical procedure on a robotic/mechanical system.

Strong mechanical engineering links:

- Operation of robots and automated cells.
- Setup, maintenance, inspection, or task execution procedures.
- Compliance with a technical manual and correct operation sequence.
- Ergonomics and hands-free interfaces using smart glasses.
- Operational safety and error reduction.
- Experimental evaluation of human task performance with and without assistance, if feasible.

## Proposed Problem Statement

Operating robotic systems requires manual consultation, prior technical knowledge, and attention to the correct sequence of commands and checks. In training, maintenance, or assisted operation contexts, switching attention between the equipment, the manual, and a conventional interface can increase execution time, cognitive load, and risk of error. This project investigates whether a multimodal assistant based on smart glasses, current image context, local language models, and technical information retrieval can support an operator during a robot procedure while keeping the guidance grounded in the relevant technical documentation.

## Possible Title

Development and evaluation of a local multimodal assistant for guided robot operation using smart glasses, current image context, and technical information retrieval.

Alternative shorter title:

Local multimodal assistant for guided Epson robot operation using smart glasses.

## General Objective

To develop and evaluate a local multimodal assistant to support operation of the EPSON T6-B602S robot with the TP3 teach pendant, integrating smart glasses, current image context, audio commands, technical information retrieval, and a locally executed language model.

## Specific Objectives

1. To develop the infrastructure of the multimodal assistant, enabling the operator to interact with the processing backend through smart glasses, including image capture, audio capture, real-time communication, and response feedback to the operator.
2. To implement a local inference module using an open-source model, allowing operator questions to be processed without dependency on third-party cloud services.
3. To explore information retrieval techniques, such as technical content segmentation, semantic segmentation, filtering, and re-ranking of manual sections according to the operator question.
4. To implement a guided workflow for a specific robot operation, monitoring the current task state and providing step-by-step instructions during execution.
5. To experimentally evaluate the assistant during robot operation, considering metrics such as task completion time, checklist adherence, number of errors, response latency, correctness of retrieved information, and adequacy of the generated instructions.

## Development Framing

For the official thesis text, the objectives should present the system as the thesis development itself. The previous company proof of concept can be explained later in the methodology or implementation chapter as the initial version from which the thesis system evolved. It should not appear as an official objective.

## Research Questions

1. Can a local multimodal assistant integrated with smart glasses guide the execution of an operational procedure on an Epson robot with measurable adherence to a technical checklist?
2. Does structured technical information retrieval provide enough context to generate useful instructions and reduce generic or incorrect answers?
3. Which stages of the procedure are most sensitive to failures in vision, audio, information retrieval, or local model interpretation?
4. Which experimental metrics best describe the usefulness of the system: execution time, checklist adherence, number of errors, external interventions, response latency, or instruction correctness?

## Chapter Structure

### Chapter 1 - Context and Problem

Purpose: start broad, justify the relevance of the topic, and narrow the discussion toward the specific project problem.

Content:

- Industrial automation and the use of robots in production and laboratory environments.
- Difficulty of robot operation, operator training, and technical manual consultation.
- Traditional interfaces: teach pendant, screens, buttons, printed manuals, and digital documentation.
- Opportunity created by smart glasses and multimodal assistance.
- Specific problem: guiding robot operation using camera input, audio, and technical documentation.
- General objective and specific objectives.
- Scope and limitations of the work.

### Chapter 2 - Literature Review

Purpose: explain the concepts needed to understand and solve the problem.

Suggested blocks:

- Industrial robotics and assisted operation.
- Human-machine interfaces and assisted/augmented reality.
- Smart glasses in industrial environments.
- Multimodal image understanding for smart-glasses context.
- Language models and multimodal models.
- Retrieval-augmented generation: document chunking, embeddings, vector search, reranking, and generation.
- Voice processing: speech-to-text and audio commands.
- Local model execution: privacy, latency, hardware requirements, reliability, and offline availability.
- State of the art: academic and industrial solutions for AR assistance, multimodal AI, and robotics.

### Chapter 3 - Materials and Methods

Purpose: explain resources, implementation decisions, and the experimental plan.

Content:

- EPSON T6-B602S robot, TP3 teach pendant, and selected coordinate-movement procedure.
- Vuzix Blade 2 glasses or alternative client, if the Kotlin app is not used in the final scope.
- Bun/Hono backend and local model services.
- Current image capture from smart glasses as visual context.
- Robot technical manual and document processing pipeline.
- Local model candidates and selection criteria.
- Proposed system architecture.
- Experimental protocol:
  - task to be executed;
  - checklist of steps;
  - correct/incorrect criteria;
  - number of executions;
  - conditions with and without assistance, if experimentally feasible;
  - collected metrics.

### Chapter 4 - Results

Purpose: present what was implemented and measured.

Content:

- Final implemented architecture.
- Relevant code excerpts and repository links.
- Technical document pipeline.
- Local model integration.
- Demonstration video.
- Information retrieval results.
- Generated procedure and stepper-state results:
  - generated steps compared with the ground-truth checklist;
  - user-confirmed step progression;
  - completed, not completed, and abandoned tasks;
  - wrong or skipped steps;
  - response latency;
  - examples of good and bad responses.
- Technical discussion of limitations.

### Chapter 5 - Conclusions

Purpose: close the thesis by comparing results with the objectives and literature review.

Content:

- General conclusion.
- Which objectives were achieved.
- What worked and what did not work.
- Comparison with related work.
- Practical limitations.
- Future work:
  - tests with more users;
  - deeper integration with the robot;
  - model embedded directly on the device;
  - fine-tuning;
  - validation against safety standards;
  - expansion to maintenance and industrial assembly tasks.

## Model and Retrieval Candidates

Recommended starting direction:

- Do not start by training an LLM or VLM from scratch.
- First implement RAG over the Epson manual and replace the Gemini call with a local API-compatible model.
- Start with Ollama or a similar local server because of the simple HTTP integration.
- Test small multimodal models before larger ones.

Local model test notes:

- `qwen3-vl:8b` failed to call the guided-procedure/tool flow correctly after RAG in the Epson TP3 procedure use case.
- `qwen3.5:7b` also failed to call the guided-procedure/tool flow correctly.
- `qwen3.6:27b` also failed to call the guided-procedure/tool flow correctly.
- Future model selection should prioritize reliable function/tool calling with image input, not only multimodal answer quality.

Candidates to research or test:

- Gemma 3/Gemma 3n: open Google model family focused on local/device execution and multimodal capabilities.
- Qwen2.5-VL: strong candidate for documents, visual localization, and image understanding.
- Llama 4 Scout/Maverick: multimodal and open-weight, but likely heavier; can be discussed conceptually or tested only if hardware allows it.
- Whisper local already exists in the Python backend and can be kept for transcription if it performs well.

Initial sources to review later:

- Google DeepMind Gemma 3n: https://deepmind.google/models/gemma/gemma-3n/
- Google Gemma 3 announcement: https://blog.google/technology/developers/gemma-3/
- Qwen2.5-VL Technical Report: https://arxiv.org/abs/2502.13923
- Ollama vision docs: https://docs.ollama.com/capabilities/vision
- Meta Llama 4 announcement: https://about.fb.com/news/2025/04/llama-4-multimodal-intelligence/

## Planned Model, Tool, and Infrastructure Architecture

Approved infrastructure direction as of 2026-05-08: use a TypeScript-first local backend, with Hono as the HTTP framework, Bun as the runtime, and Vercel AI SDK Core as the model/tool layer. The backend should run locally with Bun, not as a Vercel serverless deployment.

Main stack:

- Main backend: TypeScript + Hono running locally on Bun.
- AI/model layer: Vercel AI SDK Core.
- Runtime model access: Ollama or another local OpenAI-compatible endpoint.
- RAG storage: Postgres + pgvector.
- Database layer: Drizzle.
- RAG ingestion: TypeScript script.
- Chunking: LangChain JS text splitters.
- Embeddings: AI SDK embedMany for ingestion and embed for runtime queries.
- Optional reranking: AI SDK rerank, if the chosen model/provider supports it.
- Speech-to-text: push-to-talk audio from the glasses, transcribed through a local whisper.cpp service called by the TypeScript backend.

Current planned runtime flow:

```text
Push-to-talk audio + current image
        |
        v
Hono backend
        |
        |-- store current image as an artifact
        |-- transcribe audio with local whisper.cpp, if audio was used
        |-- load session memory, active task memory, and relevant artifact references
        |-- pass transcript/question + current image + task context to AI SDK model call
        |-- model may call tools
        |
        |-- useRag(query)
        |-- createProceduralPlan(task, retrievedContext)
        |-- askUser(question)
        |-- getImage(imageRef)
        |
        |-- if createProceduralPlan is used, store generated steps in task memory
        |-- if the active task is multi-step, wait for user confirmation through UI or voice before advancing currentStepIndex
        |
        v
Grounded answer streamed back to the client/glasses, optionally with structured procedure state
```

Tool definitions in concept:

- useRag(query): searches the Epson TP3/manual knowledge base and returns relevant technical sections with citations. This is the grounding mechanism for robot operation, teach pendant usage, procedures, errors, setup, and safety-relevant questions.
- createProceduralPlan(task, retrievedContext): creates a structured step-by-step procedure only when the operator asks how to perform a task and the answer requires more than two ordered steps. The plan must be grounded in retrieved manual sections. Calling this tool turns the current task into a multi-step task owned by the application state.
- askUser(question): asks the operator for missing information, clarification, or step confirmation when the model cannot continue from the available question, current image, task context, or retrieved manual sections.
- getImage(imageRef): retrieves a previously stored image artifact when the model needs to inspect an older image again, especially inside an active multi-step task. Conversation history should store image references and descriptions, not raw image data.

Safety-related behavior should be handled through grounded retrieval, procedural planning constraints, explicit uncertainty handling, and asking the user when required information is missing.

Not every question should produce a multi-step answer. Simple questions should receive direct grounded answers. Complex procedural questions that require more than two steps should trigger createProceduralPlan and become multi-step tasks.

The application, not the model alone, owns multi-step stage management. When createProceduralPlan is used, the backend stores the generated steps in task memory and the UI switches to a stepper-style view focused on the current step, with previous/current/next step navigation. The user must confirm each step through the UI or by voice before the backend advances the task state.

Planned state model:

```text
Session
  |-- id
  |-- activeTaskId
  |-- tasks[]
  |-- artifacts[]

Task
  |-- id
  |-- title
  |-- status: active | completed | not_completed | abandoned
  |-- summary
  |-- currentStepIndex
  |-- steps[]
  |-- messages[]
  |-- imageRefs[]

ImageArtifact
  |-- id
  |-- path
  |-- capturedAt
  |-- taskId
  |-- linkedMessageId
  |-- description
```

The RAG tool should remain the grounding mechanism. The model should not be trusted to answer procedural or safety-related robot questions from memory when manual context can be retrieved.

RAG ingestion flow:

```text
Epson manual PDF
        |
        v
Extract text and metadata
        |
        v
Chunk with LangChain JS text splitters
        |
        v
Generate embeddings with AI SDK embedMany
        |
        v
Store content + metadata + vector in Postgres/pgvector
```

Runtime RAG flow:

```text
Operator transcript/question
        |
        v
AI SDK embed(query)
        |
        v
pgvector search
        |
        v
optional rerank
        |
        v
useRag returns cited manual chunks
        |
        v
AI SDK generates grounded streamed answer
```

Candidate model direction to test:

- Prioritize local multimodal / VLM models that support both image understanding and reliable tool following.
- First candidates discussed: Qwen3-VL 8B as primary test candidate and Gemma 4 E4B as lightweight comparison, with larger variants considered only if hardware allows.
- Evaluation should explicitly test smart-glasses image usefulness, transcription quality for push-to-talk commands, RAG retrieval quality, generated procedure quality, step-confirmation/state tracking, and tool-following reliability for useRag, createProceduralPlan, askUser, and getImage.


## Experimental Evaluation Plan

### Candidate Procedure Discovery

The Epson TP3 Rev.13 manual was inspected to identify candidate procedures for the experimental comparison between manual-only operation and contextual step-by-step guidance.

Approved candidates:

1. Primary candidate: step-jog the robot to a specified coordinate.
   - Natural length: approximately 8 operator steps.
   - Main references: TP3 manual sections 4.2, 6, Operation 1.1.1, 2.4.3, 3.1.1, and 3.2 to 3.2.6.
   - Observable completion: the current-position display reaches the predefined target within an experimentally defined tolerance.
   - The target coordinate, starting pose, coordinate system, jog increments, tolerance, and collision-free movement sequence require supervisor and workcell validation.
2. Backup candidate: register and save the current robot position as a point.
   - Natural length: 5 operator steps.
   - Main references: TP3 manual Operation 1.2 and 3.2.7.
   - Observable completion: the specified point is saved in the selected point file.
   - Use an isolated experimental point file and point number to avoid overwriting production data.
3. Reset an Emergency Stop state.
   - Natural length: 6 operator steps.
   - Main reference: TP3 manual section 1.3.
   - Observable completion: the Emergency Stop status on the TP3 status bar changes to OFF.
   - Candidate is conditional on laboratory safety approval; the cause must be removed and safe operation verified before reset.
4. Define a temporary Local coordinate system.
   - Natural length: approximately 6 operator steps.
   - Main references: TP3 manual Operation 3.5 and 3.5.1.
   - Observable completion: an unused Local coordinate-system number from 1 to 15 changes from undefined to the predefined X, Y, Z, U, V, and W values after applying the configuration.
   - Local 0 is the base coordinate system and cannot be changed from this panel.
   - Use a supervisor-approved unused Local number, do not use the temporary coordinate system for robot motion, and clear it after the trial.
   - The TP3 manual refers to the EPSON RC+ SPEL+ Language Reference for complete Local-setting semantics, so the trial values and cleanup require supervisor validation.
5. Change TP3 LCD brightness.
   - Natural length: 3 operator steps when AUTO mode is the standardized starting state.
   - Main references: TP3 manual Operation 5.3 and 5.3.1.
   - Observable completion: the brightness slider and visible display brightness reach the predefined trial setting.
   - This is a low-risk, reversible short control task but has lower relevance to robot operation and may produce a ceiling effect.

Rejected standalone candidate:

- Turn all robot motors ON and then OFF. Motor enabling is an intrinsic sub-step of the primary coordinate-jogging procedure and should not be evaluated as a separate procedure.

Important limitation: the TP3 manual does not establish T6-B602S-specific compatibility, workspace limits, collision-free trajectories, or numeric motion-command semantics. These require the relevant T-series/manipulator, workcell, and SPEL+ documentation or supervisor validation. Both experimental conditions must receive the same task, starting state, target, tolerance, allowed documentation, and intervention criteria.

Current agreed evaluation direction:

1. Use one specific Epson robot operation.
   - Selected operation: move the EPSON T6-B602S robot arm to a specific coordinate using the TP3 teach pendant.
   - Possible procedure steps:
     - turn on the robot/controller;
     - enter the required operation mode;
     - navigate to the coordinate or motion command;
     - enter or select the target coordinate;
     - execute the movement;
     - verify the robot reached the intended coordinate.

2. Treat the selected procedure as the experimental ground truth after validation.
   - Convert the procedure into an official checklist.
   - Each checklist step should define:
     - expected action: what the operator must perform;
     - acceptance criteria: what counts as a safely completed step;
     - error criteria: skipped step, wrong command, unsafe action, or required intervention.
   - Each run can then be converted into numerical results, at least using binary correct/incorrect values per step.

3. Create a predefined operator question set.
   - Prepare around 20 questions that the operator may ask during the process.
   - Each question should have an expected manual section and expected answer type.
   - Example structure:

| Question | Expected Manual Section | Expected Answer Type |
| --- | --- | --- |
| "How do I enter teach mode?" | TP3 manual section X | Step-by-step instruction |
| "What does this button do?" | Manual section Y | Explanation |
| "What should I do next?" | Procedure/checklist context | Next instruction |

4. Evaluate retrieval.
   - For each predefined question, measure whether the system retrieved the correct manual section.
   - Useful metrics:
     - Hit@1: correct section is the first retrieved result;
     - Hit@3: correct section appears in the top 3 retrieved results;
     - retrieval precision: whether retrieved sections are relevant;
     - failure count: number of times the correct section was not found.

5. Evaluate generated instructions.
   - Each assistant answer should be scored using a simple rubric:

| Score | Meaning |
| --- | --- |
| 0 | Incorrect, unsafe, hallucinated, or unrelated |
| 1 | Partially correct but incomplete or unclear |
| 2 | Correct, grounded, and usable |

6. Evaluate the guided operation during execution.
   - During each run, measure:
     - total task completion time;
     - number of correct steps;
     - number of skipped steps;
     - number of wrong steps;
     - number of external interventions;
     - checklist adherence percentage.
   - Checklist adherence formula:

```text
adherence = correctStepsCompleted / totalRequiredSteps
```

7. Compare system configurations.
   - Baseline/configurations to compare:
     - no RAG;
     - RAG without reranking;
     - RAG with filtering/reranking.

Minimal evaluation design:

1. One Epson robot operation.
2. One official checklist.
3. Around 20 predefined operator questions.
4. Three system configurations: no RAG, RAG without reranking, and RAG with filtering/reranking.
5. Three to five guided execution trials.
6. Metrics: Hit@3 retrieval accuracy, instruction correctness score, generated-procedure adherence, step-confirmation accuracy, response latency, checklist adherence, and number of wrong/skipped steps.

## Metrics

Primary metrics:

- Time to complete the task.
- Number of correct steps.
- Number of skipped or wrong steps.
- Checklist adherence percentage.
- Number of times the assistant gave useful guidance.
- Number of hallucinated or wrong instructions.
- Response latency.

Secondary metrics:

- Retrieval hit rate: whether the correct technical section was found.
- Generated-procedure adherence: how closely the generated steps match the ground-truth checklist.
- Step-confirmation accuracy: whether task state changes match user-confirmed progress.
- User-perceived usefulness, if human tests are included.
- Local model resource usage: RAM/VRAM, tokens/s, CPU/GPU load.

## Scope Control

Do not make the thesis too broad.

Good scope:

- One robot.
- One manual.
- One or two procedures.
- One or two local multimodal model candidates.
- Clear checklist-based evaluation.

Risky scope:
- Many models without a clear metric.
- Many robot tasks.
- Training a large model from scratch.
- Trying to solve all robot operation problems.
- Treating the work as only a software demo without experimental evaluation.

## Next Actions

1. Done: robot confirmed as EPSON T6-B602S and teach pendant confirmed as TP3.
2. Done: selected operational procedure is moving the robot arm to a specific coordinate.
3. Transform the coordinate-movement procedure into an experimental checklist with correctness, error, and intervention criteria.
4. Define how the trials will be recorded: video, backend logs, manual timing, system responses, user step confirmations, and observations.
5. Done: selected local stack is Bun + Hono + Vercel AI SDK Core + Postgres/pgvector + Drizzle.
6. Build the project first; formal thesis writing comes later.
7. Rebuild all backend-related parts according to the new Bun/Hono architecture.

## Working Assumption

The strongest thesis is not "I built an AI assistant." The stronger thesis is:

I developed and experimentally evaluated a multimodal assistant for robot operation, showing how local AI and structured technical documentation can support safer and more efficient execution of mechanical/industrial procedures.
