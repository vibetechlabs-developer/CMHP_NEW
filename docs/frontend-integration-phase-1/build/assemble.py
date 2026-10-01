# -*- coding: utf-8 -*-
"""Assembles index_shell.html + sections.html + steps-data.json + app.js -> index.html"""
import json

with open("steps-data.json", encoding="utf-8") as f:
    steps_data = json.load(f)
steps_json = json.dumps(steps_data, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")

with open("app.js", encoding="utf-8") as f:
    app_js = f.read()

with open("sections.html", encoding="utf-8") as f:
    sections_html = f.read()

with open("index_shell.html", encoding="utf-8") as f:
    shell = f.read()

assert "<!--SECTIONS-->" in shell
assert "__STEPS_JSON__" in shell
assert "__APP_JS__" in shell

out = shell.replace("<!--SECTIONS-->", sections_html)
out = out.replace("__STEPS_JSON__", steps_json)
out = out.replace("__APP_JS__", app_js)

with open("../index.html", "w", encoding="utf-8") as f:
    f.write(out)

print("Wrote ../index.html:", len(out), "bytes")
