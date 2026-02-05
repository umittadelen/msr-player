from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import requests
import urllib3

app = Flask(__name__)
CORS(app)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
API_BASE = "https://monster-siren.hypergryph.com/api"

@app.route("/api/songs", methods=["GET"])
def get_songs():
    try:
        response = requests.get(f"{API_BASE}/songs", timeout=10, verify=False)
        response.raise_for_status()
        return jsonify(response.json())
    except Exception as error:
        print(f"Error fetching songs: {error}")
        return jsonify({"error": str(error)}), 500

@app.route("/api/song/<cid>", methods=["GET"])
def get_song(cid):
    try:
        response = requests.get(f"{API_BASE}/song/{cid}", timeout=10, verify=False)
        response.raise_for_status()
        return jsonify(response.json())
    except Exception as error:
        return jsonify({"error": str(error)}), 500

@app.route("/api/lyrics/<path:url>", methods=["GET"])
def get_lyrics(url):
    try:
        response = requests.get(url, timeout=10, verify=False)
        response.raise_for_status()
        return response.text, 200, {"Content-Type": "text/plain"}
    except Exception as error:
        return jsonify({"error": str(error)}), 500

@app.route("/api/albums", methods=["GET"])
def get_albums():
    try:
        response = requests.get(f"{API_BASE}/albums", timeout=10, verify=False)
        response.raise_for_status()
        return jsonify(response.json())
    except Exception as error:
        print(f"Error fetching albums: {error}")
        return jsonify({"error": str(error)}), 500


@app.route("/api/album/<album_cid>/detail", methods=["GET"])
def get_album_detail(album_cid):
    try:
        response = requests.get(
            f"{API_BASE}/album/{album_cid}/detail", timeout=10, verify=False
        )
        response.raise_for_status()
        return jsonify(response.json())
    except Exception as error:
        print(f"Error fetching album detail: {error}")
        return jsonify({"error": str(error)}), 500


@app.route("/api/image", methods=["GET"])
def get_image():
    try:
        url = request.args.get("url", "")
        if not url:
            return jsonify({"error": "Missing url parameter"}), 400

        response = requests.get(url, timeout=10, verify=False)
        response.raise_for_status()
        content_type = response.headers.get("Content-Type", "image/png")
        return response.content, 200, {"Content-Type": content_type}
    except Exception as error:
        print(f"Error fetching image: {error}")
        return jsonify({"error": str(error)}), 500


@app.route("/api/audio", methods=["GET"])
def get_audio():
    try:
        url = request.args.get("url", "")
        if not url:
            return jsonify({"error": "Missing url parameter"}), 400

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        
        # First, do a HEAD request to get content length
        head_resp = requests.head(url, timeout=10, verify=False, headers=headers)
        content_length = head_resp.headers.get("Content-Length")
        content_type = head_resp.headers.get("Content-Type", "audio/wav")
        total_size = int(content_length) if content_length else 0
        
        # Check for range request
        range_header = request.headers.get("Range")
        
        if range_header and total_size:
            # Parse range header
            range_match = range_header.replace("bytes=", "").split("-")
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if range_match[1] else total_size - 1
            
            # Request partial content from upstream
            headers["Range"] = f"bytes={start}-{end}"
            upstream = requests.get(url, stream=True, timeout=30, verify=False, headers=headers)
            
            def generate():
                for chunk in upstream.iter_content(chunk_size=65536):
                    if chunk:
                        yield chunk
            
            response_headers = {
                "Content-Type": content_type,
                "Content-Length": str(end - start + 1),
                "Content-Range": f"bytes {start}-{end}/{total_size}",
                "Accept-Ranges": "bytes"
            }
            return Response(generate(), status=206, headers=response_headers)
        else:
            # Stream the full file
            upstream = requests.get(url, stream=True, timeout=60, verify=False, headers=headers)
            upstream.raise_for_status()
            
            actual_content_type = upstream.headers.get("Content-Type", content_type)
            if "text/html" in actual_content_type:
                print(f"Error: Received HTML instead of audio from {url}")
                return jsonify({"error": "CDN returned HTML instead of audio"}), 400

            def generate():
                for chunk in upstream.iter_content(chunk_size=65536):
                    if chunk:
                        yield chunk

            response_headers = {
                "Content-Type": actual_content_type,
                "Accept-Ranges": "bytes"
            }
            if total_size:
                response_headers["Content-Length"] = str(total_size)
                
            return Response(generate(), headers=response_headers)
    except Exception as error:
        print(f"Error fetching audio: {error}")
        return jsonify({"error": str(error)}), 500


@app.route("/api/font", methods=["GET"])
def get_font():
    try:
        url = request.args.get("url", "")
        if not url:
            return jsonify({"error": "Missing url parameter"}), 400

        response = requests.get(url, timeout=30, verify=False)
        response.raise_for_status()
        
        # Determine content type from URL
        if url.endswith(".woff"):
            content_type = "font/woff"
        elif url.endswith(".woff2"):
            content_type = "font/woff2"
        elif url.endswith(".ttf"):
            content_type = "font/ttf"
        elif url.endswith(".eot"):
            content_type = "application/vnd.ms-fontobject"
        else:
            content_type = "application/octet-stream"
        
        return Response(response.content, headers={
            "Content-Type": content_type,
            "Cache-Control": "public, max-age=31536000"
        })
    except Exception as error:
        print(f"Error fetching font: {error}")
        return jsonify({"error": str(error)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
