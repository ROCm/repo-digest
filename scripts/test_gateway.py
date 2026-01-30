from anthropic import Anthropic
import os

client = Anthropic(
    base_url="https://llm-api.amd.com/Anthropic",
    api_key="dummy",
    default_headers={
        "Ocp-Apim-Subscription-Key": os.environ.get("LLM_GATEWAY_KEY"),
        "user": "Aleksei",
        "anthropic-version": "2023-10-16"
    }
)

response = client.messages.create(
    model="claude-sonnet-4",
    max_tokens=200,
    temperature=0.7,
    messages=[
        {"role": "user", "content": "How does AI work?"}
    ]
)

print(response.content)
