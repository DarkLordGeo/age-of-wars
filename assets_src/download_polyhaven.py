"""Downloads Poly Haven (CC0) glTF 1k packs into assets_src/polyhaven/<id>/ (never overwrites existing files).
Usage: python assets_src/download_polyhaven.py id [id ...]"""
import json, os, sys, urllib.request
UA = {'User-Agent': 'AgeOfWarsAssetPipeline/1.0'}
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'polyhaven')

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()

for aid in sys.argv[1:]:
    d = os.path.join(ROOT, aid)
    os.makedirs(d, exist_ok=True)
    files = json.loads(get(f'https://api.polyhaven.com/files/{aid}'))
    info = json.loads(get(f'https://api.polyhaven.com/info/{aid}'))
    json.dump(info, open(os.path.join(d, 'info.json'), 'w'), indent=1)
    g = files['gltf']['1k']['gltf']
    todo = {os.path.basename(g['url']): g['url']}
    for rel, v in g['include'].items():
        todo[rel] = v['url']
    for rel, url in todo.items():
        dst = os.path.join(d, rel)
        if os.path.exists(dst):
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, 'wb').write(get(url))
    print('ok', aid, sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(d) for f in fs) // 1000, 'KB', flush=True)
