# Delete All Data Feature

## Overview
A new "Delete All Data" button has been added to the Settings page that allows administrators to permanently delete all saved data from the WhatsApp AI agent system.

## Location
The button is located in the **Quick Actions** section of the Settings page (`/settings`).

## What Gets Deleted
When the "Delete All Data" button is clicked, the following data will be permanently deleted:

### Data Files (`/data/` directory)
- `memory.json` - User conversation memory and context
- `profiles.json` - User profiles and preferences
- `subscriptions.json` - User subscription data
- `users.json` - User account information
- `usage.json` - Usage statistics and metrics
- `flow_state.json` - Conversation flow states
- All `campaign_*.json` files - Campaign data (dynamic naming)

### Configuration Files
- `config/kb_index.json` - Knowledge base index

### Cache Directories
- `.wwebjs_cache/` - WhatsApp Web.js cache data
- `.wwebjs_auth/` - WhatsApp Web.js authentication data

## Safety Features
1. **Double Confirmation**: Users must confirm the action twice
2. **Detailed Warning**: Clear explanation of what will be deleted
3. **Error Handling**: Graceful handling of file deletion errors
4. **File Recreation**: Empty JSON files are recreated to maintain system structure

## Usage
1. Navigate to Settings page (`/settings`)
2. Scroll down to the "Quick Actions" section
3. Click the "Delete All Data" button (💥 icon)
4. Read the warning message and click "OK"
5. Confirm the final deletion by clicking "OK" again
6. Wait for the operation to complete
7. Optionally reload the page when prompted

## API Endpoint
The feature uses the following API endpoint:
- **POST** `/settings/api/delete-all-data`
- Returns JSON response with success status and message

## Technical Implementation
- **File**: `src/settings_page.js`
- **Function**: `deleteAllData()` (client-side)
- **API**: `/api/delete-all-data` endpoint (server-side)
- **Dependencies**: Node.js `fs` and `path` modules

## Notes
- This action is **irreversible** - deleted data cannot be recovered
- The system will continue to function after deletion with empty data files
- Users may need to re-authenticate with WhatsApp after cache deletion
- Consider backing up important data before using this feature
