# WhatsApp API System Flow Documentation

## 🏗️ System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    WhatsApp API System                         │
├─────────────────────────────────────────────────────────────────┤
│  Client Request  →  Express API  →  Queue System  →  WhatsApp   │
└─────────────────────────────────────────────────────────────────┘
```

## 📊 Complete System Flow Diagram

```
┌───────────────┐    ┌─────────────────┐    ┌──────────────────┐
│   HTTP Client │────│   Express API   │────│   Auth Check     │
│               │    │                 │    │   (JWT Token)    │
└───────────────┘    └─────────────────┘    └──────────────────┘
                             │                        │
                             │                        │ ✅ Authorized
                             ▼                        ▼
                    ┌─────────────────┐    ┌──────────────────┐
                    │  Send Message   │    │  Message Queue   │
                    │   Controller    │────│   (SQLite DB)    │
                    └─────────────────┘    └──────────────────┘
                             │                        │
                             │                        │
                             ▼                        ▼
                    ┌─────────────────┐    ┌──────────────────┐
                    │ Number Validation│    │  Queue Processor │
                    │ & Formatting    │    │  (Background)    │
                    └─────────────────┘    └──────────────────┘
                             │                        │
                             │                        │
                             ▼                        ▼
                    ┌─────────────────┐    ┌──────────────────┐
                    │   Add to Queue  │    │ WhatsApp Client  │
                    │   (Persistent)  │────│   Validation     │
                    └─────────────────┘    └──────────────────┘
                                                      │
                                                      │
                                                      ▼
                                           ┌──────────────────┐
                                           │  Send Message    │
                                           │   to WhatsApp    │
                                           └──────────────────┘
                                                      │
                                                      │
                                                      ▼
                                           ┌──────────────────┐
                                           │   Update Job     │
                                           │    Status        │
                                           └──────────────────┘
```

## 🔄 Message Queue Processing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Queue Processing Cycle                      │
└─────────────────────────────────────────────────────────────────┘

   ┌─ WAITING ─┐      ┌─ ACTIVE ─┐      ┌─ COMPLETED ─┐
   │  Status   │ ───► │ Status   │ ───► │   Status     │
   │ (Queued)  │      │(Process) │      │ (Success)    │
   └───────────┘      └──────────┘      └──────────────┘
        │                   │                    ▲
        │                   │                    │
        │                   ▼                    │
        │            ┌─ FAILED ─┐                │
        │            │ Status   │                │
        │            │(Retry?)  │                │
        │            └──────────┘                │
        │                   │                    │
        │                   │ Can Retry?         │
        │                   │                    │
        │              ┌────▼────┐               │
        │              │   YES   │               │
        └──────────────┤Increment├───────────────┘
                       │Attempts │
                       └─────────┘
                              │
                              ▼
                       ┌─────────────┐
                       │ Exponential │
                       │  Backoff    │
                       │   Delay     │
                       └─────────────┘
```

## 🚦 Auto-Recovery & Session Management

```
┌─────────────────────────────────────────────────────────────────┐
│                 WhatsApp Session Management                     │
└─────────────────────────────────────────────────────────────────┘

WhatsApp Events:
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    QR Code  │───►│   Ready     │───►│ Keep-Alive  │
│  Generated  │    │  Session    │    │   Monitor   │
└─────────────┘    └─────────────┘    └─────────────┘
                          │                   │
                          │                   │
                          ▼                   ▼
                   ┌─────────────┐    ┌─────────────┐
                   │ Start Queue │    │ Session     │
                   │ Processor   │    │ Timeout?    │
                   └─────────────┘    └─────────────┘
                                             │
                                             │ YES
                                             ▼
                                      ┌─────────────┐
                                      │ Auto-Restart│
                                      │  Session    │
                                      └─────────────┘
```

## 📱 API Endpoints Flow

```
Authentication Flow:
POST /api/auth/login
    │
    ├─ Validate credentials
    ├─ Generate JWT token
    └─ Return token

Message Sending Flow:
POST /api/whatsapp/send-message (+ Auth Header)
    │
    ├─ Verify JWT token
    ├─ Validate phone number
    ├─ Format number (62xxx format)
    ├─ Add to SQLite queue
    └─ Return queued response

Queue Management:
GET  /api/whatsapp/retry-queue (+ Auth)
POST /api/whatsapp/queue/clear (+ Auth)
POST /api/whatsapp/queue/config (+ Auth)
```

## 🔧 Error Handling & Retry Strategy

```
Error Classification:
┌─────────────────┐    ┌─────────────────┐
│ Retryable Errors│    │Non-Retryable    │
│                 │    │    Errors       │
├─────────────────┤    ├─────────────────┤
│• Session closed │    │• Number not     │
│• Protocol error │    │  registered     │
│• Network timeout│    │• Invalid number │
│• Client not     │    │• Blocked user   │
│  ready          │    │• Rate limited   │
└─────────────────┘    └─────────────────┘
        │                      │
        │                      │
        ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│ Exponential     │    │ Mark as Failed  │
│ Backoff Retry   │    │ (Permanent)     │
│                 │    │                 │
│ 2s→4s→8s→16s→32s│    │ No more retries │
└─────────────────┘    └─────────────────┘
```

## 💾 Database Schema

```
Users Table:
┌─────────────────────────────────────────┐
│ id | email | password | refreshToken     │
│────┼───────┼──────────┼─────────────────│
│ 1  | user@ | $hash$   | jwt_refresh_tok │
└─────────────────────────────────────────┘

Message Jobs Table:
┌─────────────────────────────────────────────────────────────┐
│ id | messageId | chatId | message | status | attempts | ... │
│────┼───────────┼────────┼─────────┼────────┼──────────┼─────│
│ j1 | msg_123   | 62xxx@ | Hello   | active │    2     │ ... │
│ j2 | msg_124   | 62yyy@ | Hi      | failed │    5     │ ... │
└─────────────────────────────────────────────────────────────┘
```

## ⚡ Performance Features

```
Concurrency Control:
┌─────────────────────────────────────────┐
│ Max 3 concurrent message processing     │
│                                         │
│ Job 1: [████████████] 100% Complete    │
│ Job 2: [██████      ]  60% Processing  │
│ Job 3: [███         ]  30% Starting    │
│                                         │
│ Queue: 15 waiting jobs                  │
└─────────────────────────────────────────┘

Priority System:
HIGH    ────► Process first
NORMAL  ────► Standard queue
LOW     ────► Process last
```

## 🔍 Monitoring & Logging

```
Real-time Status:
┌─────────────────────────────────────────┐
│ WhatsApp Status: ✅ Connected           │
│ Queue Status:    📊 Processing          │
│ Active Jobs:     3/3                    │
│ Pending Jobs:    12                     │
│ Failed Jobs:     2                      │
│ Success Rate:    94.2%                  │
└─────────────────────────────────────────┘

Log Events:
📥 Message queued: job_xxx to 628xxx (priority: HIGH)
📤 Processing job job_xxx to 628xxx (attempt 1)
🔍 Validating contact for 628xxx@c.us
✅ Contact validation successful for 628xxx
📤 Sending message to 628xxx@c.us: Hello...
✅ Job job_xxx completed successfully
```

## 🚀 Deployment Benefits

```
┌─────────────────────────────────────────┐
│              Advantages                 │
├─────────────────────────────────────────┤
│ ✅ Zero External Dependencies          │
│ ✅ Single SQLite Database              │
│ ✅ Auto-Recovery System                │
│ ✅ Persistent Message Queue            │
│ ✅ JWT Authentication                  │
│ ✅ Exponential Backoff                 │
│ ✅ Real-time Monitoring                │
│ ✅ Easy Backup & Deploy                │
└─────────────────────────────────────────┘
```