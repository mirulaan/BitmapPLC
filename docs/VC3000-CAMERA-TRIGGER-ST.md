# HIK VC3000 Camera Trigger Sequence (Structured Text)

## I/O Mapping

| Tag | IEC Address | Type | Description |
| :--- | :--- | :--- | :--- |
| `DI_0` | `%IX0.0` | `BOOL` | `PB.Start` — Push Button Start |
| `DI_1` | `%IX0.1` | `BOOL` | `PB.Retest` — Push Button Retest |
| `DI_2` | `%IX0.2` | `BOOL` | `Sen.Present` — Unit Present Sensor |
| `DO_0` | `%QX0.0` | `BOOL` | `TL.Green` — Tower Light Green (`Result-OK`) |
| `DO_1` | `%QX0.1` | `BOOL` | `TL.Yellow` — Tower Light Yellow (System Ready) |
| `DO_2` | `%QX0.2` | `BOOL` | `TL.Red` — Tower Light Red (`Result-NG`) |
| `DO_3` | `%QX0.3` | `BOOL` | `TL.Buzzer` — Tower Light Buzzer (200 ms ON/OFF for 5 s) |

## Sequence Behavior

1. **System Ready (`step = 0`)**: `DO_1` (`TL.Yellow`) is ON when `TCP_CLIENT_FB` is connected and the sequence is ready.
2. **Start (`DI_0`)**: Allowed only when `DI_2` (`Sen.Present`) is `TRUE`. Sends `"camTrig"` via `TCP_SEND_FB`.
3. **Wait for Reply (`step = 20`)**: Enables `TCP_RECV_FB` for a single message (`NEW_DATA` disables `recvEn`), then checks `FIND(rxBuf, 'Result-OK') > 0` or `FIND(rxBuf, 'Result-NG') > 0`.
4. **`Result-OK` (`step = 30`)**: Turns ON `DO_0` (`TL.Green`) until `DI_2` (`Sen.Present`) turns OFF.
5. **`Result-NG` (`step = 40`)**: Turns ON `DO_2` (`TL.Red`) and pulses `DO_3` (`TL.Buzzer`) at 200 ms for 5 seconds. Enables `DI_1` (`PB.Retest`) to repeat from step 2 until `Result-OK` is received.
6. **Unit Removed (`NOT DI_2`)**: Resets `step := 0`, clears `DO_0`, `DO_2`, `DO_3`, and stops any active TCP send/receive or buzzer timers.

## Variable Declarations (`main`)

Declare `DI_0`..`DI_2` and `DO_0`..`DO_3` in **Global Variables** (`Resource`), and reference them as `VAR_EXTERNAL` in `main`:

```iecst
VAR_EXTERNAL
    DI_0 : BOOL; (* PB.Start    - %IX0.0 *)
    DI_1 : BOOL; (* PB.Retest   - %IX0.1 *)
    DI_2 : BOOL; (* Sen.Present - %IX0.2 *)
    DO_0 : BOOL; (* TL.Green    - %QX0.0 *)
    DO_1 : BOOL; (* TL.Yellow   - %QX0.1 *)
    DO_2 : BOOL; (* TL.Red      - %QX0.2 *)
    DO_3 : BOOL; (* TL.Buzzer   - %QX0.3 *)
END_VAR

VAR
    (* Camera TCP Settings *)
    camIp       : STRING := '127.0.0.1';
    camPort     : INT := 5000;
    endChar     : STRING := 'CRLF';

    (* TCP Function Blocks *)
    tcpClient   : TCP_CLIENT_FB;
    tcpSend     : TCP_SEND_FB;
    tcpRecv     : TCP_RECV_FB;

    (* Sequence & Edge Detection *)
    step        : INT := 0; (* 0=Ready, 10=Send, 20=WaitReply, 30=OK, 40=NG *)
    prevStart   : BOOL := FALSE;
    prevRetest  : BOOL := FALSE;
    startEdge   : BOOL := FALSE;
    retestEdge  : BOOL := FALSE;
    sendReq     : BOOL := FALSE;
    recvEn      : BOOL := FALSE;
    rxBuf       : STRING := '';

    (* Buzzer 200ms ON/OFF for 5s *)
    buzzTotalTmr : TON;
    buzzBlinkTmr : TON;
    buzzActive   : BOOL := FALSE;
    buzzOut      : BOOL := FALSE;
END_VAR
```

## Structured Text Program (`main`)

```iecst
(* 1. Maintain TCP Client connection *)
tcpClient(ENABLE := TRUE, HOST := camIp, PORT := camPort);

(* 2. Rising-edge detection for push buttons *)
startEdge  := DI_0 AND NOT prevStart;
retestEdge := DI_1 AND NOT prevRetest;
prevStart  := DI_0;
prevRetest := DI_1;

(* 3. Reset everything to Ready if Sen.Present turns OFF *)
IF NOT DI_2 THEN
    step       := 0;
    sendReq    := FALSE;
    recvEn     := FALSE;
    buzzActive := FALSE;
    buzzOut    := FALSE;
    DO_0       := FALSE;
    DO_2       := FALSE;
    DO_3       := FALSE;
END_IF;

(* 4. Sequence State Machine *)
CASE step OF
    0: (* Ready / Idle *)
        DO_0 := FALSE;
        DO_2 := FALSE;
        buzzActive := FALSE;

        (* Step 1 & 2: Only allow PB.Start when Sen.Present is ON *)
        IF DI_2 AND startEdge THEN
            sendReq := TRUE;
            step    := 10;
        END_IF;

    10: (* Send "camTrig" + CRLF *)
        tcpSend(
            ENABLE   := sendReq AND tcpClient.CONNECTED,
            CONN_ID  := tcpClient.CONN_ID,
            DATA     := 'camTrig',
            END_CHAR := endChar
        );
        IF tcpSend.DONE THEN
            sendReq := FALSE;
            rxBuf   := '';
            recvEn  := TRUE;
            step    := 20;
        ELSIF tcpSend.ERROR THEN
            sendReq := FALSE;
            step    := 0;
        END_IF;

    20: (* Wait for TCP Reply - receive 1 time only *)
        tcpRecv(
            ENABLE  := recvEn,
            CONN_ID := tcpClient.CONN_ID
        );
        IF tcpRecv.NEW_DATA THEN
            rxBuf  := tcpRecv.DATA;
            recvEn := FALSE; (* Stop receiving after 1 message *)

            IF FIND(rxBuf, 'Result-OK') > 0 THEN
                step := 30;
            ELSIF FIND(rxBuf, 'Result-NG') > 0 THEN
                buzzActive := TRUE;
                buzzOut    := TRUE;
                step       := 40;
            ELSE
                (* Unexpected string: keep listening *)
                recvEn := TRUE;
            END_IF;
        END_IF;

    30: (* Result-OK: Green ON until Sen.Present turns OFF *)
        DO_0       := TRUE;
        DO_2       := FALSE;
        buzzActive := FALSE;

    40: (* Result-NG: Red ON, Buzzer 200ms for 5s, PB.Retest enabled *)
        DO_0 := FALSE;
        DO_2 := TRUE;

        (* Step 7 & 8: PB.Retest repeats from Step 2 until Result-OK *)
        IF DI_2 AND retestEdge THEN
            buzzActive := FALSE;
            sendReq    := TRUE;
            step       := 10;
        END_IF;
END_CASE;

(* 5. Reset tcpSend edge when not in step 10 *)
IF step <> 10 THEN
    tcpSend(ENABLE := FALSE, CONN_ID := tcpClient.CONN_ID, DATA := '', END_CHAR := endChar);
END_IF;

(* 6. Buzzer 200ms ON/OFF for 5 seconds *)
buzzTotalTmr(IN := buzzActive, PT := T#5s);
buzzBlinkTmr(IN := buzzActive AND NOT buzzTotalTmr.Q AND NOT buzzBlinkTmr.Q, PT := T#200ms);
IF buzzBlinkTmr.Q THEN
    buzzOut := NOT buzzOut;
END_IF;
IF buzzTotalTmr.Q THEN
    buzzActive := FALSE;
END_IF;
DO_3 := buzzActive AND NOT buzzTotalTmr.Q AND buzzOut;

(* 7. Yellow Tower Light: System Ready *)
DO_1 := tcpClient.CONNECTED AND (step = 0);
```
