#!/usr/bin/env python3
"""Entry point; the logic lives in make_sheet.py (importable for tests). See its docstring."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_sheet
make_sheet.main()
