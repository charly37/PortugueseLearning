#!/usr/bin/env python3
"""
get_refresh_token.py - One-time local helper to obtain a YouTube OAuth2 refresh token.

Run this on your laptop BEFORE deploying the uploader — it is NOT included in the Docker image.

    pip install google-auth-oauthlib
    python get_refresh_token.py --client-id <ID> --client-secret <SECRET>

A browser window will open for Google consent. After approving, the refresh token is
printed along with the kubectl command to add it to the k8s secret.
"""

import argparse
import base64
import sys


def main():
    parser = argparse.ArgumentParser(description="Obtain a YouTube OAuth2 refresh token.")
    parser.add_argument("--client-id", required=True, help="OAuth2 client ID from Google Cloud Console")
    parser.add_argument("--client-secret", required=True, help="OAuth2 client secret")
    args = parser.parse_args()

    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError:
        print("ERROR: pip install google-auth-oauthlib", file=sys.stderr)
        sys.exit(1)

    client_config = {
        "installed": {
            "client_id": args.client_id,
            "client_secret": args.client_secret,
            "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }

    scopes = ["https://www.googleapis.com/auth/youtube.upload"]
    flow = InstalledAppFlow.from_client_config(client_config, scopes)
    creds = flow.run_local_server(port=0)

    token = creds.refresh_token
    encoded_id = base64.b64encode(args.client_id.encode()).decode()
    encoded_secret = base64.b64encode(args.client_secret.encode()).decode()
    encoded_token = base64.b64encode(token.encode()).decode()

    print("\n=== Refresh token obtained ===")
    print(token)
    print("\n=== Add all three values to the k8s secret ===")
    print(
        f"kubectl patch secret portuguese-learning-secrets \\\n"
        f"  --namespace portuguese-learning \\\n"
        f"  --type merge \\\n"
        f"  -p '{{"
        f'"data": {{'
        f'"youtube-client-id": "{encoded_id}", '
        f'"youtube-client-secret": "{encoded_secret}", '
        f'"youtube-refresh-token": "{encoded_token}"'
        f"}}}}'"
    )


if __name__ == "__main__":
    main()
