#ifndef PLC_TCP_H
#define PLC_TCP_H

#include <stdint.h>
#include <stdbool.h>
#include <string.h>

#ifdef __cplusplus
extern "C" {
#endif

#if defined(__wasm__) || defined(__wasm32__)
__attribute__((import_module("env"), import_name("host_tcp_server_step")))
void host_tcp_server_step(int32_t en, int32_t port, uint8_t* active, int16_t* client_count, uint8_t* error);

__attribute__((import_module("env"), import_name("host_tcp_client_step")))
void host_tcp_client_step(int32_t en, const char* host, int32_t host_len, int32_t port, uint8_t* connected, int16_t* conn_id, uint8_t* error);

__attribute__((import_module("env"), import_name("host_tcp_send")))
void host_tcp_send(int32_t en, int32_t conn_id, const char* data, int32_t data_len, const char* end_char, int32_t end_len, uint8_t* done, uint8_t* error);

__attribute__((import_module("env"), import_name("host_tcp_recv")))
void host_tcp_recv(int32_t en, int32_t conn_id, uint8_t* new_data, char* out_buf, int32_t out_cap, int32_t* out_len, uint8_t* error);
#endif

static inline void plc_tcp_server_step(bool en, int16_t port, bool* active, int16_t* client_count, bool* error) {
#if defined(__wasm__) || defined(__wasm32__)
    uint8_t a = 0, e = 0;
    host_tcp_server_step(en ? 1 : 0, (int32_t)port, &a, client_count, &e);
    *active = (a != 0);
    *error = (e != 0);
#else
    (void)en; (void)port;
    *active = false;
    *client_count = 0;
    *error = false;
#endif
}

static inline void plc_tcp_client_step(bool en, const uint8_t* host, uint8_t host_len, int16_t port, bool* connected, int16_t* conn_id, bool* error) {
#if defined(__wasm__) || defined(__wasm32__)
    uint8_t c = 0, e = 0;
    host_tcp_client_step(en ? 1 : 0, (const char*)host, (int32_t)host_len, (int32_t)port, &c, conn_id, &e);
    *connected = (c != 0);
    *error = (e != 0);
#else
    (void)en; (void)host; (void)host_len; (void)port;
    *connected = false;
    *conn_id = 0;
    *error = false;
#endif
}

static inline void plc_tcp_send_step(bool en, int16_t conn_id, const uint8_t* data, uint8_t data_len, const uint8_t* end_char, uint8_t end_len, bool* done, bool* error) {
#if defined(__wasm__) || defined(__wasm32__)
    uint8_t d = 0, e = 0;
    host_tcp_send(en ? 1 : 0, (int32_t)conn_id, (const char*)data, (int32_t)data_len, (const char*)end_char, (int32_t)end_len, &d, &e);
    *done = (d != 0);
    *error = (e != 0);
#else
    (void)en; (void)conn_id; (void)data; (void)data_len; (void)end_char; (void)end_len;
    *done = false;
    *error = false;
#endif
}

static inline void plc_tcp_recv_step(bool en, int16_t conn_id, bool* new_data, char* out_buf, int32_t out_cap, int32_t* out_len, bool* error) {
#if defined(__wasm__) || defined(__wasm32__)
    uint8_t nd = 0, e = 0;
    host_tcp_recv(en ? 1 : 0, (int32_t)conn_id, &nd, out_buf, out_cap, out_len, &e);
    *new_data = (nd != 0);
    *error = (e != 0);
#else
    (void)en; (void)conn_id; (void)out_buf; (void)out_cap;
    *new_data = false;
    *out_len = 0;
    *error = false;
#endif
}

#ifdef __cplusplus
}
#endif

#endif // PLC_TCP_H
