# Knowledge Base Troubleshooting Guide

## Connection Errors

If you see "Connection error" or "Failed to create embedding" messages, the system will automatically use fallback mode.

### What is Fallback Mode?

When OpenAI API is unavailable, the Knowledge Base automatically switches to:
- **Fallback embeddings**: Simple hash-based embeddings instead of OpenAI embeddings
- **Keyword search**: Basic word matching instead of semantic search
- **Reduced quality**: Search results may be less accurate but still functional

### How to Enable Full Functionality

1. **Set OpenAI API Key**:
   ```bash
   export OPENAI_API_KEY="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"
   ```

2. **Or add to .env file**:
   ```
   OPENAI_API_KEY=your-api-key-here
   ```

3. **Restart the application**

### How to Disable Embeddings Completely

If you want to use only keyword search (no embeddings at all):

```bash
export DISABLE_KB_EMBEDDINGS=true
```

## Common Issues

### 1. "Cannot convert undefined or null to object"
- **Cause**: Old KB index format
- **Solution**: Automatically fixed by migration system
- **Action**: No action needed, system will migrate automatically

### 2. "formatBytes is not defined"
- **Cause**: Missing utility function
- **Solution**: Fixed in latest version
- **Action**: Update to latest version

### 3. "Connection error" during search
- **Cause**: OpenAI API unavailable
- **Solution**: System uses fallback mode automatically
- **Action**: Check internet connection and API key

## Performance Tips

### For Better Search Results:
1. **Use OpenAI API**: Set OPENAI_API_KEY for semantic search
2. **Quality documents**: Upload well-formatted PDFs/TXTs
3. **Descriptive queries**: Use specific keywords in searches

### For Fallback Mode:
1. **Use exact keywords**: Match words in your documents
2. **Multiple terms**: Include several relevant words in queries
3. **Check document content**: Ensure your documents contain the terms you're searching for

## Status Indicators

The Knowledge Base page shows:
- **Green checkmark**: Full functionality with OpenAI
- **Warning icon**: Fallback mode active
- **Error icon**: System issues detected

## Migration Information

The system automatically migrates old KB data:
- Adds missing metadata fields
- Generates source IDs for existing chunks
- Preserves all existing data
- No manual intervention required

## Support

If you continue to experience issues:
1. Check the console logs for detailed error messages
2. Verify your OpenAI API key is valid
3. Ensure you have internet connectivity
4. Try uploading a simple text file to test the system
