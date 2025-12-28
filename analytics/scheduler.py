#!/usr/bin/env python3
"""
Scheduler for weakness analysis job.
Runs the analysis daily at 2:00 AM.
"""

import sys
import time
from datetime import datetime, time as dt_time
from analyze_weaknesses import WeaknessAnalyzer

def calculate_seconds_until_next_run(target_hour: int = 2, target_minute: int = 0) -> int:
    """
    Calculate seconds until next scheduled run.
    
    Args:
        target_hour: Hour to run (0-23), default 2 AM
        target_minute: Minute to run (0-59), default 0
        
    Returns:
        Seconds until next scheduled time
    """
    now = datetime.now()
    target_time = now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
    
    # If target time has passed today, schedule for tomorrow
    if now >= target_time:
        target_time = target_time.replace(day=target_time.day + 1)
    
    seconds_until = (target_time - now).total_seconds()
    return int(seconds_until)


def run_analysis():
    """Run the weakness analysis job."""
    print(f"[{datetime.now()}] Starting scheduled weakness analysis")
    
    try:
        analyzer = WeaknessAnalyzer()
        analyzer.analyze_all_users(days_back=30, min_attempts=10)
        analyzer.close()
        print(f"[{datetime.now()}] Analysis completed successfully")
        return True
    except Exception as e:
        print(f"[{datetime.now()}] ERROR during analysis: {e}", file=sys.stderr)
        return False


def main():
    """Main scheduler loop."""
    print(f"[{datetime.now()}] Weakness Analysis Scheduler started")
    print(f"[{datetime.now()}] Will run daily at 2:00 AM")
    
    # Run immediately on startup (optional - comment out if not desired)
    print(f"[{datetime.now()}] Running initial analysis...")
    run_analysis()
    
    # Main scheduling loop
    while True:
        # Calculate time until next 2 AM
        seconds_until_next = calculate_seconds_until_next_run(target_hour=2, target_minute=0)
        hours_until = seconds_until_next / 3600
        
        print(f"[{datetime.now()}] Next run in {hours_until:.2f} hours")
        print(f"[{datetime.now()}] Sleeping until next scheduled time...")
        
        # Sleep until next scheduled time
        time.sleep(seconds_until_next)
        
        # Run the analysis
        run_analysis()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n[{datetime.now()}] Scheduler stopped by user")
        sys.exit(0)
    except Exception as e:
        print(f"[{datetime.now()}] FATAL ERROR: {e}", file=sys.stderr)
        sys.exit(1)
