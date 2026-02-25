use yeti_core::prelude::*;

/// Message: public read + create + delete + subscribe (realtime demo)
/// Visitors can post messages, watch them stream in real-time, and clear all.
resource!(TableExtender for Message {
    get => allow_read(),
    post => allow_create(),
    delete => allow_delete(),
    subscribe => allow_read(),
});
