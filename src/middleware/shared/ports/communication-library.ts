import type { StlibArchiveDTO } from './library-port'

const TCP_SERVER_FB_SOURCE = `FUNCTION_BLOCK TCP_SERVER_FB
VAR_INPUT
  ENABLE : BOOL;
  PORT : INT;
END_VAR
VAR_OUTPUT
  ACTIVE : BOOL;
  CLIENT_COUNT : INT;
  ERROR : BOOL;
END_VAR
#include "plc_tcp.h"
void setup() {}
void loop() {
  bool active = false, err = false;
  int16_t count = 0;
  plc_tcp_server_step(ENABLE, PORT, &active, &count, &err);
  ACTIVE = active;
  CLIENT_COUNT = count;
  ERROR = err;
}
END_FUNCTION_BLOCK
`

const TCP_CLIENT_FB_SOURCE = `FUNCTION_BLOCK TCP_CLIENT_FB
VAR_INPUT
  ENABLE : BOOL;
  HOST : STRING;
  PORT : INT;
END_VAR
VAR_OUTPUT
  CONNECTED : BOOL;
  CONN_ID : INT;
  ERROR : BOOL;
END_VAR
#include "plc_tcp.h"
void setup() {}
void loop() {
  const char* h = HOST.c_str();
  bool conn = false, err = false;
  int16_t cid = 0;
  plc_tcp_client_step(ENABLE, (const uint8_t*)h, (uint8_t)strlen(h), PORT, &conn, &cid, &err);
  CONNECTED = conn;
  CONN_ID = cid;
  ERROR = err;
}
END_FUNCTION_BLOCK
`

const TCP_SEND_FB_SOURCE = `FUNCTION_BLOCK TCP_SEND_FB
VAR_INPUT
  ENABLE : BOOL;
  CONN_ID : INT;
  DATA : STRING;
  END_CHAR : STRING;
END_VAR
VAR_OUTPUT
  DONE : BOOL;
  ERROR : BOOL;
END_VAR
#include "plc_tcp.h"
void setup() {}
void loop() {
  const char* d = DATA.c_str();
  const char* e = END_CHAR.c_str();
  bool done = false, err = false;
  plc_tcp_send_step(ENABLE, CONN_ID, (const uint8_t*)d, (uint8_t)strlen(d), (const uint8_t*)e, (uint8_t)strlen(e), &done, &err);
  DONE = done;
  ERROR = err;
}
END_FUNCTION_BLOCK
`

const TCP_RECV_FB_SOURCE = `FUNCTION_BLOCK TCP_RECV_FB
VAR_INPUT
  ENABLE : BOOL;
  CONN_ID : INT;
END_VAR
VAR_OUTPUT
  NEW_DATA : BOOL;
  DATA : STRING;
  LENGTH : INT;
  ERROR : BOOL;
END_VAR
#include "plc_tcp.h"
void setup() {}
void loop() {
  int32_t out_len = 0;
  bool nd = false, err = false;
  char buf[255] = {0};
  plc_tcp_recv_step(ENABLE, CONN_ID, &nd, buf, 254, &out_len, &err);
  NEW_DATA = nd;
  ERROR = err;
  if (out_len > 0) {
    buf[out_len < 254 ? out_len : 254] = '\\0';
    DATA = buf;
  }
  LENGTH = (int16_t)out_len;
}
END_FUNCTION_BLOCK
`

/**
 * Built-in Communication system library providing IEC 61131-3 TCP/IP function blocks.
 */
export const COMMUNICATION_LIBRARY_ARCHIVE: StlibArchiveDTO = {
  format: 'stlib',
  version: 1,
  manifest: {
    name: 'Communication',
    version: '1.0.0',
    author: 'BitmapPLC',
    description: 'General-purpose Ethernet TCP/IP Server, Client, Send, and Receive function blocks.',
    functions: [],
    functionBlocks: [
      {
        name: 'TCP_SERVER_FB',
        implementation: 'cpp',
        sourceFile: 'TCP_SERVER_FB.cpp',
        inputs: [
          { name: 'ENABLE', direction: 'input', type: 'BOOL' },
          { name: 'PORT', direction: 'input', type: 'INT' },
        ],
        outputs: [
          { name: 'ACTIVE', direction: 'output', type: 'BOOL' },
          { name: 'CLIENT_COUNT', direction: 'output', type: 'INT' },
          { name: 'ERROR', direction: 'output', type: 'BOOL' },
        ],
        inouts: [],
      },
      {
        name: 'TCP_CLIENT_FB',
        implementation: 'cpp',
        sourceFile: 'TCP_CLIENT_FB.cpp',
        inputs: [
          { name: 'ENABLE', direction: 'input', type: 'BOOL' },
          { name: 'HOST', direction: 'input', type: 'STRING' },
          { name: 'PORT', direction: 'input', type: 'INT' },
        ],
        outputs: [
          { name: 'CONNECTED', direction: 'output', type: 'BOOL' },
          { name: 'CONN_ID', direction: 'output', type: 'INT' },
          { name: 'ERROR', direction: 'output', type: 'BOOL' },
        ],
        inouts: [],
      },
      {
        name: 'TCP_SEND_FB',
        implementation: 'cpp',
        sourceFile: 'TCP_SEND_FB.cpp',
        inputs: [
          { name: 'ENABLE', direction: 'input', type: 'BOOL' },
          { name: 'CONN_ID', direction: 'input', type: 'INT' },
          { name: 'DATA', direction: 'input', type: 'STRING' },
          { name: 'END_CHAR', direction: 'input', type: 'STRING' },
        ],
        outputs: [
          { name: 'DONE', direction: 'output', type: 'BOOL' },
          { name: 'ERROR', direction: 'output', type: 'BOOL' },
        ],
        inouts: [],
      },
      {
        name: 'TCP_RECV_FB',
        implementation: 'cpp',
        sourceFile: 'TCP_RECV_FB.cpp',
        inputs: [
          { name: 'ENABLE', direction: 'input', type: 'BOOL' },
          { name: 'CONN_ID', direction: 'input', type: 'INT' },
        ],
        outputs: [
          { name: 'NEW_DATA', direction: 'output', type: 'BOOL' },
          { name: 'DATA', direction: 'output', type: 'STRING' },
          { name: 'LENGTH', direction: 'output', type: 'INT' },
          { name: 'ERROR', direction: 'output', type: 'BOOL' },
        ],
        inouts: [],
      },
    ],
    types: [],
    dependencies: [],
  },
  sources: [
    { fileName: 'TCP_SERVER_FB.cpp', source: TCP_SERVER_FB_SOURCE },
    { fileName: 'TCP_CLIENT_FB.cpp', source: TCP_CLIENT_FB_SOURCE },
    { fileName: 'TCP_SEND_FB.cpp', source: TCP_SEND_FB_SOURCE },
    { fileName: 'TCP_RECV_FB.cpp', source: TCP_RECV_FB_SOURCE },
  ],
} as unknown as StlibArchiveDTO
