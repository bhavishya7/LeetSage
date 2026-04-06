# Implementation Plan: AI Learning Assistant

## Overview

This implementation plan transforms the LeetSage Chrome extension into an AI-powered learning companion. The approach follows a bottom-up strategy: first establishing the Chrome extension infrastructure and data models, then building the core extraction and storage layers, followed by the LLM integration and filtering logic, and finally assembling the React UI components with action buttons and content display.

The implementation uses React 19.1.1, TypeScript 5.8.3, Tailwind CSS 4.1.12, and Chrome Extension Manifest V3 APIs. Each task builds incrementally, with checkpoints to validate functionality before proceeding.

## Tasks

- [x] 1. Set up Chrome extension project structure and configuration
  - Create manifest.json with Manifest V3 configuration for side panel, content scripts, and background service worker
  - Configure Vite build system for Chrome extension with separate entry points for side panel, content script, and background worker
  - Set up TypeScript configuration with strict mode and Chrome types
  - Configure Tailwind CSS 4.1.12 with custom theme for action buttons and content cards
  - Create directory structure: src/sidepanel, src/content, src/background, src/services, src/components, src/types
  - _Requirements: 1.1, 11.1_

- [x] 2. Define core TypeScript interfaces and data models
  - Create types/models.ts with ProblemContext, LearningContent, ProgressState, ActionType, ContentType interfaces
  - Create types/api.ts with LLMRequest, LLMResponse, APIConfig, UserSettings interfaces
  - Create types/messages.ts with message passing schemas for Chrome runtime communication
  - Define ActionType enum with all 7 action types (GET_HINT, GENERATE_EXAMPLES, BREAK_DOWN_PROBLEM, EXPLAIN_CONCEPT, CHECK_APPROACH, TIME_COMPLEXITY_HINT, PATTERN_RECOGNITION)
  - _Requirements: 1.3, 1.4, 2.1, 2.2, 10.1, 10.2, 10.3, 10.4_

- [x] 3. Implement Problem Context Extractor content script
  - [x] 3.1 Create content script with DOM extraction logic
    - Write content/extractor.ts that queries LeetCode DOM for problem title, difficulty, description, examples, constraints, and test cases
    - Implement MutationObserver to detect problem page navigation and content changes
    - Add retry logic with exponential backoff (3 attempts) for handling dynamic content loading
    - Extract examples by parsing pre-formatted code blocks in problem description
    - Extract constraints from problem description list items
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [ ]* 3.2 Write property test for Problem Context Completeness
    - **Property 1: Problem Context Completeness**
    - **Validates: Requirements 2.1, 2.2**
    - Test that extraction returns all required fields (title, url, difficulty, description, examples, constraints, testCases) with no null/undefined values
  
  - [ ]* 3.3 Write property test for Problem Context Updates
    - **Property 2: Problem Context Updates on Change**
    - **Validates: Requirements 2.3**
    - Test that DOM changes trigger re-extraction with updated timestamp

- [x] 4. Implement background service worker and Chrome storage integration
  - Create background/service-worker.ts with message routing logic
  - Implement message handlers for PROBLEM_DATA, GET_PROBLEM_DATA, and TRACK_ACTION message types
  - Create storage service (services/storage.ts) that wraps Chrome Storage API with type-safe methods
  - Implement storage methods: saveProblemContext, getProblemContext, saveProgress, getProgress, saveSettings, getSettings
  - Add error handling for storage quota exceeded and corrupted data scenarios
  - _Requirements: 2.4, 8.3, 8.4, 11.2_

- [x] 5. Implement Progress Tracker service
  - [x] 5.1 Create Progress Tracker with action tracking
    - Write services/progress-tracker.ts with trackAction, getProgress, and resetProgress methods
    - Implement per-problem-URL progress isolation using storage keys like "progress_{url}"
    - Track usedActions as a Set and hintLevel as a number in ProgressState
    - Persist progress to Chrome storage on every action
    - Load progress from storage on component mount
    - _Requirements: 8.1, 8.3, 8.4, 8.5_
  
  - [ ]* 5.2 Write property test for Progress Tracking Per Action
    - **Property 14: Progress Tracking Per Action**
    - **Validates: Requirements 8.1**
    - Test that action button clicks add action type to usedActions set
  
  - [ ]* 5.3 Write property test for Progress Isolation by Problem
    - **Property 16: Progress Isolation by Problem**
    - **Validates: Requirements 8.3**
    - Test that progress for different problem URLs remains independent
  
  - [ ]* 5.4 Write property test for Progress Persistence Round-Trip
    - **Property 17: Progress Persistence Round-Trip**
    - **Validates: Requirements 8.4**
    - Test that progress saved and restored maintains exact same state

- [ ] 6. Checkpoint - Ensure extraction and storage work end-to-end
  - Manually test content script extraction on a LeetCode problem page
  - Verify problem context is stored in Chrome storage
  - Verify progress tracking persists across page reloads
  - Ensure all tests pass, ask the user if questions arise

- [x] 7. Implement LLM Service with API integration
  - [x] 7.1 Create LLM Service with request/response handling
    - Write services/llm-service.ts with sendRequest and streamRequest methods
    - Implement OpenAI API format with configurable base URL and model
    - Add request timeout configuration (30 seconds)
    - Implement error handling for network failures, rate limiting (429), invalid API key (401), and timeouts
    - Add retry logic: 2 retries with 2-second delay for network errors
    - Include token usage tracking in response
    - _Requirements: 7.1, 7.2, 7.4, 7.5_
  
  - [x] 7.2 Create system prompts for each action type
    - Write services/prompts.ts with system prompt templates for all 7 action types
    - Each prompt should define learning-focused role, output format, and solution prevention rules
    - Include encouraging and supportive language in prompts
    - Add instructions for using analogies and real-world examples
    - _Requirements: 7.6, 9.1, 9.3_
  
  - [ ]* 7.3 Write property test for LLM Requests Include Problem Context
    - **Property 3: LLM Requests Include Problem Context**
    - **Validates: Requirements 2.4, 7.2**
    - Test that action button clicks include complete problem context in LLM request
  
  - [ ]* 7.4 Write property test for LLM Requests Include System Prompts
    - **Property 12: LLM Requests Include System Prompts**
    - **Validates: Requirements 7.6**
    - Test that all action types include appropriate system prompts

- [x] 8. Implement Solution Filter service
  - [x] 8.1 Create Solution Filter with detection and filtering logic
    - Write services/solution-filter.ts with filterResponse method
    - Implement complete code detection: identify code blocks with function definitions and return statements
    - Add pattern matching for common solution patterns
    - Implement length heuristics: flag code blocks exceeding 20 lines
    - Add keyword detection for phrases like "here's the complete solution", "full implementation"
    - Allow pseudocode without language-specific syntax
    - Allow code snippets under 10 lines
    - Allow code review content for CHECK_APPROACH action type
    - Return FilterResult with filteredContent, wasFiltered, and filterReason
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ]* 8.2 Write property test for Solution Filter Prevents Complete Solutions
    - **Property 9: Solution Filter Prevents Complete Solutions**
    - **Validates: Requirements 6.1, 6.3**
    - Test that complete code solutions are filtered and replaced with guidance
  
  - [ ]* 8.3 Write property test for Solution Filter Allows Snippets
    - **Property 10: Solution Filter Allows Snippets and Pseudocode**
    - **Validates: Requirements 6.2, 6.4**
    - Test that short snippets and pseudocode pass through unchanged
  
  - [ ]* 8.4 Write property test for Solution Filter Allows Code Review
    - **Property 11: Solution Filter Allows Code Review**
    - **Validates: Requirements 6.5**
    - Test that CHECK_APPROACH responses with code review pass through

- [x] 9. Implement Hint System service
  - [x] 9.1 Create Hint System with progressive hint generation
    - Write services/hint-system.ts with generateHint and getMaxHintLevel methods
    - Define 3 hint levels: Level 1 (conceptual), Level 2 (approach-oriented), Level 3 (implementation-focused)
    - Each hint should build on previous hints with increasing specificity
    - Return Hint object with level, title, content, and isLastHint flag
    - Track current hint level in ProgressState
    - _Requirements: 5.1, 5.2, 5.5_
  
  - [ ]* 9.2 Write property test for Hint Level Progression
    - **Property 7: Hint Level Progression**
    - **Validates: Requirements 5.1, 5.4**
    - Test that sequential hint requests provide levels 1, 2, 3 in order with unique level numbers
  
  - [ ]* 9.3 Write property test for Hint Display with Level Indicators
    - **Property 8: Hint Display with Level Indicators**
    - **Validates: Requirements 5.3**
    - Test that rendered hints include visible level indicators

- [x] 10. Implement Example Generator service
  - [x] 10.1 Create Example Generator with test case generation
    - Write services/example-generator.ts with generateExamples method
    - Generate at least 2 alternative test cases with input, output, complexity indicator, and explanation
    - Label each example as Simple, Medium, or Tricky based on input characteristics
    - Ensure generated examples cover different edge cases than provided examples
    - Explain educational value of each example
    - Return GeneratedExamples with examples array and comparisonView data
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [ ]* 10.2 Write property test for Generated Examples Structure
    - **Property 4: Generated Examples Structure**
    - **Validates: Requirements 3.1, 3.2, 3.4**
    - Test that generator creates at least 2 examples with all required fields (input, output, complexity, explanation)

- [x] 11. Implement Breakdown Engine service
  - [x] 11.1 Create Breakdown Engine with problem decomposition
    - Write services/breakdown-engine.ts with breakdownProblem method
    - Decompose problem into 3-5 logical sub-problems
    - Each sub-problem should have id, title, description, relevantConcepts, and suggestedDataStructures
    - Avoid implementation code in sub-problem descriptions
    - Return ProblemBreakdown with subProblems array, visualizationType, and overallStrategy
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [ ]* 11.2 Write property test for Problem Breakdown Structure
    - **Property 5: Problem Breakdown Structure**
    - **Validates: Requirements 4.1, 4.3, 4.4**
    - Test that breakdown returns 3-5 sub-problems with all required fields
  
  - [ ]* 11.3 Write property test for Breakdown Avoids Implementation Code
    - **Property 6: Breakdown Avoids Implementation Code**
    - **Validates: Requirements 4.5**
    - Test that sub-problem descriptions don't contain complete code implementations

- [ ] 12. Checkpoint - Ensure all services work independently
  - Write unit tests for each service with mock data
  - Test LLM service with real API (if key available) or mock responses
  - Verify solution filter correctly identifies and blocks complete solutions
  - Test hint system progression through all 3 levels
  - Ensure all tests pass, ask the user if questions arise

- [x] 13. Create React side panel application structure
  - [x] 13.1 Set up React app with routing and state management
    - Create sidepanel/App.tsx as main component with React hooks for state management
    - Set up AppState interface with problemContext, progress, learningContent, isLoading, error, apiKeyConfigured, chatModeActive, settings
    - Implement useEffect hooks for loading problem context and progress on mount
    - Add Chrome message listener for PROBLEM_DATA_RESPONSE messages
    - Create sidepanel/index.tsx as entry point with React 19 root rendering
    - _Requirements: 1.1, 11.3_
  
  - [x] 13.2 Create base component structure
    - Create components/ActionPanel.tsx with ActionPanelProps interface
    - Create components/ContentDisplay.tsx with ContentDisplayProps interface
    - Create components/SettingsModal.tsx for API key configuration
    - Create components/LoadingIndicator.tsx with animated skeleton screens
    - Set up Tailwind CSS utility classes for action buttons and content cards
    - _Requirements: 1.2, 1.4, 9.2, 11.1, 12.6_

- [x] 14. Implement Action Panel component
  - [x] 14.1 Create Action Panel with action buttons
    - Implement ActionPanel component that displays problem title and difficulty badge at top
    - Create grid of 7 action buttons with icons, labels, and descriptions
    - Each button should have type, label, icon, description, and used properties
    - Add onClick handlers that call onActionClick with appropriate ActionType
    - Display visual indicators (checkmarks) on buttons where progress.usedActions includes the action type
    - Add settings icon button that opens API key configuration modal
    - Display welcome message when progress.usedActions is empty
    - Add "Reset Progress" button that calls progress tracker reset method
    - Disable all action buttons when apiKeyConfigured is false
    - _Requirements: 1.2, 1.3, 1.4, 1.6, 8.2, 8.5, 11.1_
  
  - [ ]* 14.2 Write property test for Progress Visual Indicators
    - **Property 15: Progress Visual Indicators**
    - **Validates: Requirements 8.2**
    - Test that used actions display visual indicators on corresponding buttons
  
  - [ ]* 14.3 Write property test for Problem Title and Difficulty Display
    - **Property 25: Problem Title and Difficulty Display**
    - **Validates: Requirements 1.2**
    - Test that Action Panel renders problem title and difficulty text

- [x] 15. Implement Content Display component
  - [x] 15.1 Create Content Display with markdown rendering
    - Implement ContentDisplay component that renders array of LearningContent items
    - Use markdown parser library (e.g., react-markdown) with XSS protection
    - Implement syntax highlighting for code blocks using library like highlight.js or prism
    - Render lists and numbered steps with proper indentation
    - Create expandable/collapsible cards for each content piece with expand/collapse toggle
    - Add distinct visual styling (CSS classes, colors, icons) for different ContentType values
    - Implement auto-scroll to newly generated content using useEffect and scrollIntoView
    - Display loading indicators while isLoading is true
    - _Requirements: 9.2, 9.4, 10.5, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_
  
  - [ ]* 15.2 Write property test for Content Type Visual Differentiation
    - **Property 18: Content Type Visual Differentiation**
    - **Validates: Requirements 9.4**
    - Test that different content types have distinct visual styling
  
  - [ ]* 15.3 Write property test for Action Content Display Location
    - **Property 19: Action Content Display Location**
    - **Validates: Requirements 10.5**
    - Test that new content appears in Content Display area below action buttons
  
  - [ ]* 15.4 Write property test for Markdown Rendering Completeness
    - **Property 21: Markdown Rendering Completeness**
    - **Validates: Requirements 12.1, 12.3**
    - Test that markdown syntax is converted to proper HTML formatting

- [x] 16. Implement action button click handlers and LLM integration
  - [x] 16.1 Wire action buttons to LLM service
    - Create handleActionClick function in App.tsx that receives ActionType
    - Retrieve problem context from state
    - Get appropriate system prompt from prompts service based on action type
    - Construct LLMRequest with problemContext, actionType, systemPrompt, userMessage, apiKey
    - For GET_HINT action: include previousHintLevel from progress state
    - Call LLM service sendRequest or streamRequest method
    - Pass LLM response through solution filter
    - Parse filtered response into LearningContent object with unique id, type, actionType, content, timestamp
    - Add LearningContent to state and update progress tracker
    - Handle errors with user-friendly messages and retry options
    - _Requirements: 1.5, 2.4, 7.2, 7.3, 7.4, 10.5_
  
  - [ ]* 16.2 Write property test for LLM Response Parsing
    - **Property 13: LLM Response Parsing**
    - **Validates: Requirements 7.3**
    - Test that successful LLM responses are parsed into LearningContent objects

- [x] 17. Implement specialized action handlers
  - [x] 17.1 Implement GET_HINT action with hint system integration
    - In handleActionClick, detect GET_HINT action type
    - Call hint system generateHint with problemContext and current hintLevel from progress
    - Increment hintLevel in progress state after generating hint
    - Display "No more hints available" message when isLastHint is true
    - Keep previous hints visible in collapsed cards
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6_
  
  - [x] 17.2 Implement GENERATE_EXAMPLES action with example generator integration
    - In handleActionClick, detect GENERATE_EXAMPLES action type
    - Call example generator generateExamples with problemContext
    - Display examples in side-by-side comparison view with original examples
    - Show complexity indicators and explanations for each generated example
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_
  
  - [x] 17.3 Implement BREAK_DOWN_PROBLEM action with breakdown engine integration
    - In handleActionClick, detect BREAK_DOWN_PROBLEM action type
    - Call breakdown engine breakdownProblem with problemContext
    - Display sub-problems as interactive checklist or flowchart
    - Implement expand/collapse functionality for each sub-problem
    - _Requirements: 4.1, 4.2, 4.3, 4.6_
  
  - [x] 17.4 Implement remaining action types (EXPLAIN_CONCEPT, CHECK_APPROACH, TIME_COMPLEXITY_HINT, PATTERN_RECOGNITION)
    - For each action type, construct appropriate system prompt and user message
    - For CHECK_APPROACH, add text input for user to describe their approach
    - Display generated content in Content Display with appropriate formatting
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 18. Implement API key configuration UI
  - [x] 18.1 Create Settings Modal with API key input
    - Implement SettingsModal component with form for API key input
    - Add provider selection dropdown (OpenAI, Anthropic, Custom)
    - Implement API key format validation (e.g., OpenAI keys start with "sk-")
    - Save API key to Chrome storage using storage service
    - Display setup message when no API key is configured
    - Allow users to update or remove API key
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [ ]* 18.2 Write property test for API Key Format Validation
    - **Property 20: API Key Format Validation**
    - **Validates: Requirements 11.4**
    - Test that invalid API key formats are rejected

- [ ] 19. Checkpoint - Ensure core UI and action flow work end-to-end
  - Manually test each action button with real LLM API
  - Verify solution filter blocks complete solutions
  - Test hint progression through all 3 levels
  - Verify progress tracking and visual indicators
  - Test API key configuration and validation
  - Ensure all tests pass, ask the user if questions arise

- [x] 20. Implement optional Chat Mode feature
  - [x] 20.1 Create Chat Mode component
    - Create components/ChatMode.tsx with ChatModeProps interface
    - Add "Chat Mode" toggle button that is visually secondary to action buttons
    - When active, display text input field and send button
    - Implement message list display with user and assistant messages
    - Style chat messages in compact format distinct from action-generated content
    - Add exit button to return to action-button interface
    - _Requirements: 13.1, 13.2, 13.4, 13.5_
  
  - [x] 20.2 Wire Chat Mode to LLM service with solution filtering
    - Implement onSendMessage handler that sends user message to LLM service
    - Include problem context in chat requests
    - Pass all chat responses through solution filter
    - Display filtered responses in chat message format
    - _Requirements: 13.3_
  
  - [ ]* 20.3 Write property test for Chat Mode Solution Filtering
    - **Property 22: Chat Mode Solution Filtering**
    - **Validates: Requirements 13.3**
    - Test that chat responses are filtered with same rules as action-generated content
  
  - [ ]* 20.4 Write property test for Chat Mode Visual Distinction
    - **Property 23: Chat Mode Visual Distinction**
    - **Validates: Requirements 13.4**
    - Test that chat content has distinct styling from action-generated content

- [x] 21. Implement optional Stuck Timer feature
  - [x] 21.1 Create Stuck Timer service
    - Write services/stuck-timer.ts with startTimer, stopTimer, and onSuggestion callback
    - Start timer when problem page loads (5 minutes = 300,000 milliseconds)
    - Reset timer on any action button click
    - Trigger suggestion after timer expires
    - Implement cooldown period of 10 minutes between suggestions
    - Respect user preference to disable suggestions from settings
    - Suggest action based on problem difficulty and current progress
    - _Requirements: 14.1, 14.2, 14.4, 14.5_
  
  - [x] 21.2 Integrate Stuck Timer with Action Panel
    - Display gentle suggestion message when timer triggers
    - Show suggested action button with highlight or animation
    - Add dismiss button for suggestion
    - Store stuck timer state in Chrome storage
    - _Requirements: 14.1, 14.3_
  
  - [ ]* 21.3 Write property test for Stuck Timer Rate Limiting
    - **Property 24: Stuck Timer Rate Limiting**
    - **Validates: Requirements 14.4**
    - Test that suggestions are rate-limited to once every 10 minutes

- [x] 22. Implement error handling and user feedback
  - [x] 22.1 Add error handling for all failure scenarios
    - Implement error handling for problem context extraction failures with retry button
    - Add error handling for LLM API failures (network, rate limiting, invalid key, timeout) with appropriate messages
    - Implement error handling for storage quota exceeded with "Clear Old Data" option
    - Add error handling for solution filter failures with warning banner
    - Implement error handling for content rendering failures with fallback to raw content
    - Display user-friendly error messages for all error types
    - _Requirements: 2.5, 7.4_
  
  - [x] 22.2 Add positive reinforcement and encouraging language
    - Implement positive reinforcement messages when user makes progress
    - Add encouraging language in AI responses through system prompts
    - Display supportive messages when user uses learning aids effectively
    - _Requirements: 9.1, 9.5_

- [x] 23. Implement side-by-side comparison view for examples
  - Create components/ExampleComparison.tsx component
  - Display original examples and generated examples side-by-side
  - Add coverage analysis section explaining what new examples add
  - Implement responsive layout that stacks on narrow viewports
  - _Requirements: 3.6_

- [x] 24. Polish UI and add final touches
  - [x] 24.1 Refine Tailwind CSS styling for action buttons and content cards
    - Style action buttons with prominent size, clear icons, and hover effects
    - Add difficulty badge styling (Easy: green, Medium: yellow, Hard: red)
    - Style content cards with shadows, borders, and expand/collapse animations
    - Implement loading skeleton animations
    - Add visual indicators (checkmarks, badges) for used actions
    - Ensure responsive design for different side panel widths
    - _Requirements: 1.4, 8.2, 9.2_
  
  - [x] 24.2 Add accessibility features
    - Add ARIA labels to all action buttons
    - Implement keyboard navigation for action buttons and content cards
    - Add focus indicators for keyboard users
    - Ensure color contrast meets WCAG standards
    - Add screen reader announcements for loading states and new content

- [x] 25. Final checkpoint - End-to-end testing and validation
  - Test complete user flow: navigate to problem → extract context → click action buttons → view content → track progress
  - Verify all 7 action types work correctly with real LLM API
  - Test solution filter with various response types
  - Verify progress tracking persists across page reloads and problem changes
  - Test error handling for all failure scenarios
  - Verify Chat Mode and Stuck Timer features work correctly
  - Run all unit tests and property-based tests
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional property-based tests and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties across randomized inputs
- Unit tests validate specific examples, edge cases, and integration points
- The implementation follows Chrome Extension Manifest V3 architecture with clear separation between UI, content extraction, background processing, and external API communication
- All code should include TypeScript types and JSDoc comments explaining Chrome extension concepts for educational purposes
