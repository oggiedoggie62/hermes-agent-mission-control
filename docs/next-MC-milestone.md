## Next Mission Control milestones

1. Manual/Automatic execution mode
2. Edit pending mission
3. Cancel pending mission
4. Stale execution recovery
5. Retry policy
6. Parallel dispatcher (later)


## instead of just Edit and Cancel, I'd eventually include Duplicate.

That gives you:

✏️ Edit
🚀 Run Now (for Manual missions)
🔄 Convert to Automatic
📋 Duplicate
❌ Cancel

Those five actions cover almost everything you'll want to do with a pending mission and make the mission queue much more practical to use without creating new missions from scratch each time.

### Failed Mission Recovery

- [ ] Retry a failed mission unchanged as a new execution attempt
- [ ] Edit and retry a failed mission
- [ ] Cancel a failed mission while preserving execution history
- [ ] Archive reviewed failed missions
- [ ] Prevent duplicate retries and retry/dispatcher races
- [ ] Add retry limits and automatic retry policy later
