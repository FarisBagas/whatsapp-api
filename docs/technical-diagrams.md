# WhatsApp API - Technical Flow Diagrams

## 🔄 Detailed Message Processing Flow

```mermaid
graph TD
    A[HTTP Request] --> B{Auth Valid?}
    B -->|No| C[401 Unauthorized]
    B -->|Yes| D[Validate Phone Number]
    D --> E[Format Number to 62xxx]
    E --> F[Create Job ID]
    F --> G[Add to SQLite Queue]
    G --> H[Return 202 Queued Response]
    
    %% Background Processing
    I[Queue Processor] --> J{WhatsApp Ready?}
    J -->|No| K[Skip Processing]
    J -->|Yes| L[Get Jobs from Queue]
    L --> M[Mark Job as Active]
    M --> N[Validate Contact]
    N -->|Invalid| O[Mark as Failed - Permanent]
    N -->|Valid| P[Send Message]
    P -->|Success| Q[Mark as Completed]
    P -->|Error| R{Retryable?}
    R -->|Yes| S[Increment Attempts + Backoff]
    R -->|No| T[Mark as Failed - Permanent]
    S --> U{Max Attempts?}
    U -->|No| V[Schedule Retry]
    U -->|Yes| W[Mark as Failed - Max Reached]
```

## 🏗️ System Component Architecture

```mermaid
graph LR
    subgraph "Client Layer"
        A[Mobile App]
        B[Web App]
        C[API Client]
    end
    
    subgraph "API Layer"
        D[Express Server]
        E[Auth Middleware]
        F[WhatsApp Controller]
    end
    
    subgraph "Queue System"
        G[SQLite Message Queue]
        H[Queue Processor]
        I[Job Scheduler]
    end
    
    subgraph "WhatsApp Layer"
        J[WhatsApp Client]
        K[Session Manager]
        L[Auto-Recovery]
    end
    
    subgraph "Database"
        M[(SQLite DB)]
        N[Users Table]
        O[Message Jobs Table]
    end
    
    A --> D
    B --> D
    C --> D
    D --> E
    E --> F
    F --> G
    G --> H
    H --> I
    I --> J
    J --> K
    K --> L
    G --> M
    M --> N
    M --> O
```

## 🔐 Authentication & Security Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API
    participant DB as Database
    participant Q as Queue
    
    C->>A: POST /auth/login
    A->>DB: Validate credentials
    DB-->>A: User found
    A->>A: Generate JWT
    A-->>C: Return JWT token
    
    Note over C,A: Authenticated requests
    
    C->>A: POST /send-message + JWT
    A->>A: Verify JWT
    A->>A: Validate phone number
    A->>Q: Add to queue
    Q-->>A: Job queued
    A-->>C: 202 Queued response
    
    Note over Q: Background processing
    Q->>Q: Process job
    Q->>A: Update job status
```

## ⚡ Auto-Recovery & Session Management

```mermaid
stateDiagram-v2
    [*] --> Initializing
    Initializing --> QRGenerated: WhatsApp client starts
    QRGenerated --> Authenticated: QR scanned
    Authenticated --> Ready: Session established
    Ready --> KeepAlive: Start monitoring
    
    KeepAlive --> SessionTimeout: No activity
    KeepAlive --> Disconnected: Connection lost
    KeepAlive --> Ready: Ping successful
    
    SessionTimeout --> AutoRestart: Trigger recovery
    Disconnected --> AutoRestart: Trigger recovery
    AutoRestart --> Initializing: Restart client
    
    Ready --> QueueProcessing: Start processing
    QueueProcessing --> Ready: Continue monitoring
```

## 📊 Queue Job Lifecycle

```mermaid
stateDiagram-v2
    [*] --> WAITING
    WAITING --> ACTIVE: Processor picks up
    ACTIVE --> COMPLETED: Success
    ACTIVE --> FAILED: Error occurred
    
    FAILED --> WAITING: Can retry
    FAILED --> PERMANENTLY_FAILED: Max attempts
    
    COMPLETED --> [*]
    PERMANENTLY_FAILED --> [*]
    
    WAITING --> DELAYED: Backoff delay
    DELAYED --> WAITING: Delay expired
    
    WAITING --> PAUSED: Queue paused
    PAUSED --> WAITING: Queue resumed
```

## 🔧 Error Handling Decision Tree

```mermaid
flowchart TD
    A[Error Occurred] --> B{Error Type?}
    
    B -->|Session Closed| C[Retryable]
    B -->|Protocol Error| C
    B -->|Network Timeout| C
    B -->|Client Not Ready| C
    
    B -->|Number Not Registered| D[Non-Retryable]
    B -->|Invalid Number| D
    B -->|User Blocked| D
    B -->|Rate Limited| D
    
    C --> E{Attempts < 5?}
    E -->|Yes| F[Calculate Backoff]
    E -->|No| G[Mark as Failed]
    
    F --> H[Schedule Retry]
    H --> I[Next Attempt: 2^n seconds]
    
    D --> J[Mark as Permanently Failed]
    G --> J
    
    J --> K[Log Error]
    I --> L[Return to Queue]
```