#!/usr/bin/env python3
"""
Local development server with clean URL support.
Handles URLs like /fellowship → /fellowship.html
"""

import http.server
import os

class CleanURLHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Remove query string for path resolution
        path = self.path.split('?')[0]
        
        # If path doesn't have extension and isn't a file, try .html
        if '.' not in os.path.basename(path) and path != '/':
            html_path = path.rstrip('/') + '.html'
            if os.path.isfile('.' + html_path):
                self.path = html_path
        
        return super().do_GET()

if __name__ == '__main__':
    PORT = 8000
    os.chdir(os.path.dirname(os.path.abspath(__file__)) or '.')
    
    with http.server.HTTPServer(('', PORT), CleanURLHandler) as httpd:
        print(f'Serving at http://localhost:{PORT}')
        print('Press Ctrl+C to stop')
        httpd.serve_forever()
