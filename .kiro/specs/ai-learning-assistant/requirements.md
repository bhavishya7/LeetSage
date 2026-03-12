# Requirements Document

## Introduction

The AI Learning Assistant feature enhances the LeetSage Chrome extension by providing immediate, action-button-driven access to AI-powered learning aids. Users can instantly request hints, generate examples, break down problems, and access other learning tools through prominent action buttons rather than typing queries. The assistant provides progressive, interactive learning content without revealing complete solutions. This feature transforms the extension from a simple problem tracker into an engaging learning companion that deepens algorithmic understanding through quick, actionable help.

## Glossary

- **AI_Assistant**: The LLM-powered component that generates learning content in response to action button clicks
- **Action_Panel**: The UI component that displays prominent action buttons for immediate access to learning aids
- **Problem_Context**: The extracted LeetCode problem data including title, description, difficulty, examples, and constraints
- **Learning_Content**: AI-generated content that guides without providing complete solutions
- **Hint_System**: The component that generates progressive hints of increasing specificity
- **Example_Generator**: The component that creates alternative test cases with complexity indicators
- **Breakdown_Engine**: The component that decomposes problems into smaller sub-problems
- **Solution_Filter**: The component that prevents the AI from providing complete code solutions
- **Content_Display**: The area that shows AI-generated learning content with interactive elements
- **LLM_Service**: The external language model API used for generating responses
- **Progress_Tracker**: The component that tracks which learning aids have been used
- **Chat_Mode**: An optional secondary interaction mode for free-form questions

## Requirements

### Requirement 1: Action Panel Display

**User Story:** As a user, I want to see prominent action buttons for common learning aids, so that I can immediately access help without typing.

#### Acceptance Criteria

1. WHEN the user is on a LeetCode problem page, THE Action_Panel SHALL be accessible through the side panel
2. THE Action_Panel SHALL display the current problem title and difficulty at the top
3. THE Action_Panel SHALL show prominent action buttons for "Get Hint", "Generate Examples", "Break Down Problem", "Explain Concept", and "Check My Approach"
4. THE Action_Panel SHALL display action buttons with clear icons and labels
5. THE Content_Display SHALL show AI-generated learning content below the action buttons
6. WHEN the Action_Panel is first opened for a problem, THE Action_Panel SHALL display a brief welcome message explaining the available learning aids

### Requirement 2: Problem Context Extraction

**User Story:** As a user, I want the AI to understand the specific LeetCode problem I'm working on, so that it can provide relevant assistance.

#### Acceptance Criteria

1. WHEN a user navigates to a LeetCode problem page, THE Problem_Context SHALL extract the problem title, description, difficulty, examples, and constraints
2. THE Problem_Context SHALL extract all provided test cases and expected outputs
3. WHEN the problem page content changes, THE Problem_Context SHALL update the extracted data
4. THE Problem_Context SHALL be sent to the AI_Assistant before generating any Learning_Content
5. IF the Problem_Context extraction fails, THEN THE Action_Panel SHALL display an error message requesting the user to refresh the page

### Requirement 3: Alternative Example Generation

**User Story:** As a user, I want the AI to generate new examples with complexity indicators, so that I can better understand the problem requirements.

#### Acceptance Criteria

1. WHEN a user clicks "Generate Examples", THE Example_Generator SHALL create at least 2 alternative test cases with expected outputs
2. THE Example_Generator SHALL label each example with a complexity indicator (Simple, Medium, or Tricky)
3. THE Example_Generator SHALL generate examples that cover different edge cases than the provided examples
4. THE Example_Generator SHALL explain why each generated example is useful for understanding the problem
5. THE Example_Generator SHALL ensure generated examples comply with the problem's stated constraints
6. THE Content_Display SHALL show examples in a side-by-side comparison view with the original examples

### Requirement 4: Problem Breakdown

**User Story:** As a user, I want the AI to break down the problem into smaller steps with visual organization, so that I can approach the solution systematically.

#### Acceptance Criteria

1. WHEN a user clicks "Break Down Problem", THE Breakdown_Engine SHALL decompose the problem into 3 to 5 logical sub-problems
2. THE Breakdown_Engine SHALL present sub-problems as an interactive checklist or flowchart
3. THE Breakdown_Engine SHALL explain the purpose of each sub-problem
4. THE Breakdown_Engine SHALL suggest what data structures or algorithms might be relevant for each sub-problem
5. THE Breakdown_Engine SHALL avoid providing implementation code for any sub-problem
6. THE Content_Display SHALL allow users to expand each sub-problem for more details

### Requirement 5: Progressive Hint System

**User Story:** As a user, I want to receive hints of increasing specificity through expandable cards, so that I can get just enough help without spoiling the solution.

#### Acceptance Criteria

1. WHEN a user clicks "Get Hint", THE Hint_System SHALL provide a hint at the current hint level
2. THE Hint_System SHALL maintain 3 hint levels: conceptual, approach-oriented, and implementation-focused
3. THE Content_Display SHALL show hints as expandable cards with clear level indicators (Hint 1, Hint 2, Hint 3)
4. WHEN a user clicks "Get Hint" again, THE Hint_System SHALL reveal the next hint level while keeping previous hints visible
5. WHEN the user has received all hint levels, THE Hint_System SHALL inform the user that no more hints are available without revealing the complete solution
6. THE Hint_System SHALL allow users to collapse and expand individual hint cards

### Requirement 6: Solution Prevention

**User Story:** As a user, I want the AI to never give me the complete solution, so that I maintain the learning value of solving the problem myself.

#### Acceptance Criteria

1. THE Solution_Filter SHALL prevent the AI_Assistant from generating complete working code solutions
2. THE Solution_Filter SHALL allow code snippets that demonstrate specific concepts or patterns
3. WHEN the AI_Assistant attempts to generate a complete solution, THE Solution_Filter SHALL modify the response to provide guidance instead
4. THE Solution_Filter SHALL permit pseudocode that outlines logic without language-specific implementation
5. THE Solution_Filter SHALL allow the AI_Assistant to review and provide feedback on user-submitted code

### Requirement 7: LLM Integration

**User Story:** As a developer, I want to integrate a powerful LLM service, so that the AI assistant can provide high-quality learning responses.

#### Acceptance Criteria

1. THE LLM_Service SHALL support API-based communication with request and response handling
2. THE AI_Assistant SHALL send the Problem_Context and user query to the LLM_Service
3. WHEN the LLM_Service responds, THE AI_Assistant SHALL parse and display the Learning_Content
4. IF the LLM_Service request fails, THEN THE Action_Panel SHALL display an error message and allow the user to retry
5. THE LLM_Service SHALL support streaming responses for improved perceived performance
6. THE AI_Assistant SHALL include system prompts that enforce the learning-focused behavior and Solution_Filter rules

### Requirement 8: Progress Tracking

**User Story:** As a user, I want to see what learning aids I've used, so that I can track my problem-solving approach.

#### Acceptance Criteria

1. THE Progress_Tracker SHALL track which action buttons have been clicked for the current problem
2. THE Action_Panel SHALL display visual indicators (checkmarks or badges) on action buttons that have been used
3. THE Progress_Tracker SHALL store progress data per problem URL
4. WHEN the user navigates away from a problem and returns, THE Progress_Tracker SHALL restore the previous progress state
5. THE Action_Panel SHALL provide a "Reset Progress" button that clears all tracked progress and generated content for the current problem

### Requirement 9: Engaging Interaction Design

**User Story:** As a user, I want the AI assistant to feel engaging and not like a boring chatbot, so that I enjoy using it for learning.

#### Acceptance Criteria

1. THE AI_Assistant SHALL use encouraging and supportive language in Learning_Content
2. THE Content_Display SHALL display loading indicators while the AI_Assistant is generating content
3. THE AI_Assistant SHALL occasionally use analogies or real-world examples to explain concepts
4. THE Content_Display SHALL use distinct visual styling for different types of learning content (hints, examples, breakdowns)
5. WHEN the user makes progress or uses learning aids effectively, THE AI_Assistant SHALL provide positive reinforcement

### Requirement 10: Additional Learning Actions

**User Story:** As a user, I want quick access to specialized learning aids, so that I can get targeted help for specific aspects of the problem.

#### Acceptance Criteria

1. THE Action_Panel SHALL provide a "Time Complexity Hint" button that explains the expected time complexity without revealing the solution
2. THE Action_Panel SHALL provide an "Explain Concept" button that explains relevant data structures or algorithms
3. THE Action_Panel SHALL provide a "Pattern Recognition" button that identifies common algorithmic patterns in the problem
4. THE Action_Panel SHALL provide a "Check My Approach" button that allows users to describe their approach and receive feedback
5. WHEN a user clicks any action button, THE Content_Display SHALL show the corresponding learning content immediately below the action buttons
6. THE Content_Display SHALL allow multiple pieces of learning content to be visible simultaneously with clear visual separation

### Requirement 11: API Key Configuration

**User Story:** As a user, I want to configure my own LLM API key, so that I can use the AI assistant with my preferred service.

#### Acceptance Criteria

1. THE Action_Panel SHALL provide a settings icon for entering an LLM API key
2. THE Action_Panel SHALL securely store the API key using Chrome's storage API
3. WHEN no API key is configured, THE Action_Panel SHALL display a setup message with instructions
4. THE Action_Panel SHALL validate that the API key format is correct before saving
5. THE Action_Panel SHALL allow users to update or remove their API key at any time

### Requirement 12: Content Display Formatting

**User Story:** As a user, I want learning content to be well-formatted and interactive, so that I can quickly understand the guidance.

#### Acceptance Criteria

1. THE Content_Display SHALL render markdown formatting in learning content including bold, italic, and code blocks
2. THE Content_Display SHALL display code snippets with syntax highlighting
3. THE Content_Display SHALL render lists and numbered steps with proper indentation
4. THE Content_Display SHALL automatically scroll to newly generated content when an action button is clicked
5. THE Content_Display SHALL use expandable cards for organizing different types of learning content
6. THE Content_Display SHALL display loading indicators while the AI_Assistant is generating content

### Requirement 13: Optional Chat Mode

**User Story:** As a user, I want the option to ask free-form questions, so that I can get help with specific questions not covered by action buttons.

#### Acceptance Criteria

1. THE Action_Panel SHALL provide a "Chat Mode" toggle or button that is visually secondary to the primary action buttons
2. WHEN Chat_Mode is activated, THE Action_Panel SHALL display a text input field and send button
3. WHEN a user sends a message in Chat_Mode, THE AI_Assistant SHALL respond with learning content following the same Solution_Filter rules
4. THE Content_Display SHALL show chat messages in a compact format distinct from action-button-generated content
5. THE Action_Panel SHALL allow users to exit Chat_Mode and return to the action-button interface at any time

### Requirement 14: Proactive Stuck Timer

**User Story:** As a user, I want the assistant to notice when I might be stuck, so that I can receive timely suggestions without having to ask.

#### Acceptance Criteria

1. WHEN a user has been on a problem page for 5 minutes without clicking any action buttons, THE Action_Panel SHALL display a gentle suggestion to try a learning aid
2. THE Action_Panel SHALL suggest the most relevant action based on the problem difficulty and user's progress
3. THE Action_Panel SHALL allow users to dismiss the suggestion without taking action
4. THE Action_Panel SHALL not show stuck timer suggestions more than once every 10 minutes
5. WHERE the user has disabled proactive suggestions in settings, THE Action_Panel SHALL not display stuck timer suggestions
