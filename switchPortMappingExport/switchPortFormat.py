import pandas as pd
import sys
import os

def process_domotz_export(file_path):
    # Check if file exists
    if not os.path.exists(file_path):
        print(f"Error: File '{file_path}' not found.")
        return

    try:
        # Load the data (works for CSV or Excel depending on extension)
        if file_path.endswith('.csv'):
            df = pd.read_csv(file_path)
        else:
            df = pd.read_excel(file_path)

        # 1. Create a lookup dictionary: { ID: Name }
        name_map = df.set_index('Id')['Name'].to_dict()

        # 2. Filter for devices with a switch connection
        connected_devices = df[df['Connected To switch'].notna()].copy()

        # 3. Data Cleaning
        connected_devices['Connected To switch'] = connected_devices['Connected To switch'].astype(int)
        connected_devices['Switch Port'] = connected_devices['Switch Port'].fillna('?')
        
        # Clean up port display (2.0 -> "2")
        if connected_devices['Switch Port'].dtype == float:
            connected_devices['Switch Port'] = connected_devices['Switch Port'].apply(
                lambda x: str(int(x)) if isinstance(x, float) and x.is_integer() else str(x)
            )

        # 4. Generate Output
        print(f"\n{'DEVICE':<35} | {'CONNECTED TO SWITCH':<25} | {'PORT'}")
        print("-" * 85)

        for _, row in connected_devices.iterrows():
            device_name = row['Name']
            switch_id = row['Connected To switch']
            port = row['Switch Port']
            
            switch_name = name_map.get(switch_id, f"Unknown Switch ({switch_id})")
            print(f"{device_name:<35} | {switch_name:<25} | {port}")

    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    # Check if the user provided an argument
    if len(sys.argv) < 2:
        print("Usage: python3 script_name.py <path_to_file>")
    else:
        file_input = sys.argv[1]
        process_domotz_export(file_input)
