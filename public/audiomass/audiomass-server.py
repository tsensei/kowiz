#!/usr/bin/env python3
import http.server
import socketserver
import argparse
import urllib.parse

# Parse command line arguments
parser = argparse.ArgumentParser(description='AudioMass HTTP Server')
parser.add_argument('--port', type=int, default=5055, help='Port to serve on (default: 5055)')
parser.add_argument('--url', type=str, help='Audio URL to preload on startup')
args = parser.parse_args()

PORT = args.port

class AudioMassHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # If URL parameter is provided and this is the root request, redirect with the url parameter
        if args.url and self.path == '/':
            encoded_url = urllib.parse.quote(args.url, safe='')
            self.send_response(302)
            self.send_header('Location', f'/index.html?url={encoded_url}')
            self.end_headers()
            return
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

httpd = socketserver.TCPServer(("", PORT), AudioMassHandler)
print(f"Serving AudioMass at http://localhost:{PORT}")
if args.url:
    print(f"Will preload audio from: {args.url}")
httpd.serve_forever()