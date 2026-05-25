#!/usr/bin/env python3
"""
Analytics jobs runner.
Runs weakness analysis and usefulness aggregation.
Scheduling is handled externally by the Kubernetes CronJob (daily at 2:00 AM).
"""

import sys
import subprocess
from datetime import datetime
from analyze_weaknesses import WeaknessAnalyzer


def run_analysis():
    """Run the weakness analysis job."""
    print(f"[{datetime.now()}] Starting scheduled weakness analysis")
    
    try:
        analyzer = WeaknessAnalyzer()
        analyzer.analyze_all_users(days_back=30, min_attempts=10)
        analyzer.close()
        print(f"[{datetime.now()}] Weakness analysis completed successfully")
        return True
    except Exception as e:
        print(f"[{datetime.now()}] ERROR during weakness analysis: {e}", file=sys.stderr)
        return False


def run_usefulness_aggregation():
    """Run the usefulness aggregation job."""
    print(f"[{datetime.now()}] Starting usefulness aggregation")
    
    try:
        # Run the aggregation script
        result = subprocess.run(
            ['python3', '/app/aggregate_usefulness.py'],
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        if result.returncode == 0:
            print(f"[{datetime.now()}] Usefulness aggregation completed successfully")
            if result.stdout:
                print(result.stdout)
            return True
        else:
            print(f"[{datetime.now()}] ERROR during usefulness aggregation", file=sys.stderr)
            if result.stderr:
                print(result.stderr, file=sys.stderr)
            return False
            
    except subprocess.TimeoutExpired:
        print(f"[{datetime.now()}] ERROR: Usefulness aggregation timed out", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[{datetime.now()}] ERROR during usefulness aggregation: {e}", file=sys.stderr)
        return False



def main():
    """Run all analytics jobs once and exit."""
    print(f"[{datetime.now()}] Analytics jobs started")
    
    run_analysis()
    run_usefulness_aggregation()
    
    print(f"[{datetime.now()}] Analytics jobs completed")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n[{datetime.now()}] Scheduler stopped by user")
        sys.exit(0)
    except Exception as e:
        print(f"[{datetime.now()}] FATAL ERROR: {e}", file=sys.stderr)
        sys.exit(1)
